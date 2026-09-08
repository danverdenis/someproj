"""ShortsFlow — приватный Telegram-бот: видео → YouTube Shorts.

Режимы работы:
  1. Видео-режим: вы кидаете видео боту в личку.
     Бот скачивает файл, режет до 60 c и кадрирует в 9:16 (ffmpeg).
     Публикует ролик на ваш YouTube-канал как Shorts (OAuth 2.0).
     Присылает ссылку: youtube.com/shorts/...

  2. AI-режим: вы пишете идею парой строк.
     Бот разворачивает идею в полноценный сценарий через бесплатную LLM,
     рисует кадры в Pollinations (без ключа), начитывает озвучку через edge-tts,
     склеивает ролик ffmpeg и присылает вам превью.
     Вы решаете: «Опубликовать в Shorts» или «Ещё дубль».
     
     Если предварительно отправить фото с лицом, бот извлечёт лицо и будет
     использовать вашу внешность при генерации персонажа в видео.

Запуск:  python main.py   (Python 3.10+, ffmpeg в PATH)
Первый запуск откроет браузер для выдачи доступа к YouTube —
далее токен хранится в token.json и обновляется автоматически.
"""

import json
import logging
import os
import subprocess
import uuid

from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    Application, ContextTypes, MessageHandler, filters,
    CallbackQueryHandler
)

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaFileUpload

from ai_pipeline import expand_script, build_video, extract_face

# ── Настройки (из окружения, см. .env) ────────────────────────
BOT_TOKEN    = os.environ["BOT_TOKEN"]
ALLOWED_IDS  = {int(x) for x in os.environ["ALLOWED_IDS"].split(",")}
PRIVACY      = os.environ.get("PRIVACY", "unlisted")  # private|unlisted|public
DEFAULT_TAGS = [t for t in os.environ.get("DEFAULT_TAGS", "shorts").split(",") if t]
MAX_SECONDS  = int(os.environ.get("MAX_SECONDS", "58"))
WORKDIR      = "tmp"

# AI-настройки
LLM_PROVIDER = os.environ.get("LLM_PROVIDER", "groq")  # groq|gemini|openrouter
LLM_API_KEY  = os.environ.get("LLM_API_KEY", "")
LLM_MODEL    = os.environ.get("LLM_MODEL", "llama-3.3-70b-versatile")
TTS_VOICE    = os.environ.get("TTS_VOICE", "ru-RU-DmitryNeural")
SCENE_COUNT  = int(os.environ.get("SCENE_COUNT", "5"))

SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
log = logging.getLogger("shortsflow")


# ── YouTube: клиент с автообновлением OAuth-токена ────────────
def youtube_client():
    creds = None
    if os.path.exists("token.json"):
        creds = Credentials.from_authorized_user_file("token.json", SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:  # первый запуск: откроется браузер
            flow = InstalledAppFlow.from_client_secrets_file("credentials.json", SCOPES)
            creds = flow.run_local_server(port=0)
        with open("token.json", "w", encoding="utf-8") as f:
            f.write(creds.to_json())
    return build("youtube", "v3", credentials=creds)


# ── ffmpeg / ffprobe: длительность и ориентация ───────────────
def probe(path):
    raw = subprocess.check_output([
        "ffprobe", "-v", "quiet", "-print_format", "json",
        "-show_format", "-show_streams", path,
    ])
    data = json.loads(raw)
    video = next(s for s in data["streams"] if s["codec_type"] == "video")
    return float(data["format"]["duration"]), int(video["width"]), int(video["height"])


def ffmpeg(args):
    subprocess.run(["ffmpeg", "-y", *args], check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


# ── Обработчик входящих видео ─────────────────────────────────
async def on_video(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    msg = update.message
    user = update.effective_user

    # Приватность: отвечаем только своим
    if user.id not in ALLOWED_IDS:
        log.warning("Отклонён чужой запрос: %s (id=%s)", user.full_name, user.id)
        await msg.reply_text(f"Доступ запрещён. Ваш id: {user.id}")
        return

    video = msg.video or msg.document
    if video.file_size and video.file_size > 20 * 1024 * 1024:
        await msg.reply_text(
            "Файл больше 20 МБ — облачный Bot API его не отдаст. "
            "Сожмите ролик или поднимите локальный Bot API-сервер (до 2 ГБ)."
        )
        return

    status = await msg.reply_text("Принял видео. Скачиваю файл…")
    job = uuid.uuid4().hex[:8]
    os.makedirs(WORKDIR, exist_ok=True)
    src = f"{WORKDIR}/{job}_src.mp4"

    try:
        tg_file = await ctx.bot.get_file(video.file_id)
        await tg_file.download_to_drive(src)

        duration, w, h = probe(src)

        # Режем до лимита Shorts
        if duration > MAX_SECONDS:
            await status.edit_text(f"Ролик на {duration:.0f} c — режу до {MAX_SECONDS} c…")
            cut = f"{WORKDIR}/{job}_cut.mp4"
            ffmpeg(["-i", src, "-t", str(MAX_SECONDS),
                    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
                    "-c:a", "aac", cut])
            src = cut

        # Горизонталь → вертикаль 9:16 (кроп по центру)
        if w > h:
            await status.edit_text("Кадрирую в вертикаль 9:16…")
            vert = f"{WORKDIR}/{job}_vert.mp4"
            ffmpeg(["-i", src, "-vf", "crop=ih*9/16:ih,scale=1080:1920",
                    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
                    "-c:a", "aac", vert])
            src = vert

        # Подпись из Telegram становится заголовком
        title = (msg.caption or "Shorts из Telegram").strip()[:95]
        if "#shorts" not in title.lower():
            title += " #Shorts"

        await status.edit_text("Загружаю на YouTube…")
        body = {
            "snippet": {
                "title": title,
                "description": msg.caption or "Опубликовано ботом ShortsFlow",
                "tags": DEFAULT_TAGS,
                "categoryId": "22",  # People & Blogs
            },
            "status": {
                "privacyStatus": PRIVACY,
                "selfDeclaredMadeForKids": False,
            },
        }
        media = MediaFileUpload(src, mimetype="video/mp4", resumable=True)
        request = youtube_client().videos().insert(
            part="snippet,status", body=body, media_body=media)

        resp = None
        while resp is None:  # resumable-загрузка чанками
            _, resp = request.next_chunk()

        link = f"https://www.youtube.com/shorts/{resp['id']}"
        log.info("Готово: %s (%s)", link, PRIVACY)
        await status.edit_text(f"Готово! Shorts опубликован ({PRIVACY}):\n{link}")

    except HttpError as e:
        await status.edit_text(
            f"YouTube вернул ошибку {e.status_code}: проверьте квоту и доступ.")
    except subprocess.CalledProcessError:
        await status.edit_text("Не удалось обработать видео ffmpeg — файл повреждён?")
    finally:
        for f in os.listdir(WORKDIR):
            if f.startswith(job):
                os.remove(os.path.join(WORKDIR, f))


# ── Обработчик фото: извлекаем лицо для AI-режима ─────────────
async def on_photo(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    """Принимает фото и извлекает из него лицо для использования в AI-режиме."""
    msg = update.message
    user = update.effective_user

    if user.id not in ALLOWED_IDS:
        log.warning("Отклонён чужой запрос: %s (id=%s)", user.full_name, user.id)
        await msg.reply_text(f"Доступ запрещён. Ваш id: {user.id}")
        return

    photo = msg.photo[-1]  # Берём фото максимального размера
    status = await msg.reply_text("Принял фото. Ищу лицо…")
    
    os.makedirs(WORKDIR, exist_ok=True)
    photo_path = f"{WORKDIR}/{user.id}_photo.jpg"
    face_path = f"{WORKDIR}/{user.id}_face.jpg"

    try:
        # Скачиваем фото
        tg_file = await ctx.bot.get_file(photo.file_id)
        await tg_file.download_to_drive(photo_path)

        # Извлекаем лицо
        if extract_face(photo_path, face_path):
            # Сохраняем путь к лицу в user_data для использования в AI-режиме
            ctx.user_data["face_path"] = face_path
            await status.edit_text(
                "✅ Лицо сохранено!\n\n"
                "Теперь при генерации видео в AI-режиме бот будет использовать вашу внешность "
                "для создания персонажа.\n\n"
                "Напишите идею для видео, чтобы начать."
            )
            log.info("Лицо сохранено для пользователя %s: %s", user.id, face_path)
        else:
            await status.edit_text(
                "❌ Лицо не найдено на фото.\n\n"
                "Попробуйте другое фото, где лицо хорошо видно:\n"
                "• Лицо должно занимать значительную часть кадра\n"
                "• Хорошее освещение\n"
                "• Лицо анфас или в пол-оборота"
            )
            log.warning("Лицо не найдено для пользователя %s", user.id)
        
        # Удаляем исходное фото (оставляем только кроп лица)
        if os.path.exists(photo_path):
            os.remove(photo_path)

    except Exception as e:
        log.error("Ошибка при обработке фото: %s", e)
        await status.edit_text("Не удалось обработать фото. Попробуйте другое.")
        if os.path.exists(photo_path):
            os.remove(photo_path)


# ── AI-режим: идея → сценарий → видео → превью ──────────────
async def on_idea(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    msg = update.message
    user = update.effective_user
    idea = msg.text.strip()

    if user.id not in ALLOWED_IDS:
        log.warning("Отклонён чужой запрос: %s (id=%s)", user.full_name, user.id)
        await msg.reply_text(f"Доступ запрещён. Ваш id: {user.id}")
        return

    if len(idea) < 10:
        await msg.reply_text("Опишите идею подробнее — хотя бы пара предложений.")
        return

    status = await msg.reply_text("Разворачиваю идею в сценарий…")
    job = uuid.uuid4().hex[:8]
    os.makedirs(WORKDIR, exist_ok=True)

    # Проверяем, есть ли сохранённое лицо пользователя
    face_path = ctx.user_data.get("face_path", "")
    if face_path and not os.path.exists(face_path):
        log.warning("Файл лица не найден: %s", face_path)
        face_path = ""

    try:
        # 1. Генерация сценария через LLM
        script = expand_script(idea, provider=LLM_PROVIDER, api_key=LLM_API_KEY,
                               model=LLM_MODEL, scene_count=SCENE_COUNT)
        
        if face_path:
            await status.edit_text(f"Сценарий готов. Рисую кадры с вашим лицом ({len(script['scenes'])} шт)…")
        else:
            await status.edit_text(f"Сценарий готов. Рисую кадры ({len(script['scenes'])} шт)…")

        # 2. Сборка видео: кадры + озвучка + склейка
        video_path = await build_video(script, job=job, workdir=WORKDIR,
                                       tts_voice=TTS_VOICE, face_path=face_path)
        await status.edit_text("Видео собрано. Отправляю превью…")

        # 3. Превью с кнопками
        with open(video_path, "rb") as f:
            preview_msg = await msg.reply_video(
                video=f,
                caption=f"🎬 Превью готово!\n\nЗаголовок: {script['title']}\n\nЧто делаем?",
                supports_streaming=True
            )

        # Кнопки: опубликовать / ещё дубль
        keyboard = [
            [
                InlineKeyboardButton("✅ Опубликовать в Shorts", callback_data=f"publish:{job}"),
                InlineKeyboardButton("🔄 Ещё дубль", callback_data=f"retry:{job}:{idea}")
            ]
        ]
        await preview_msg.reply_text("Выберите действие:", reply_markup=InlineKeyboardMarkup(keyboard))

        # Сохраняем метаданные для callback
        ctx.bot_data[f"job:{job}"] = {
            "video_path": video_path,
            "title": script["title"],
            "idea": idea,
        }

    except ValueError as e:
        # Ожидаемые ошибки (неверный ключ, модель не найдена и т.д.)
        log.error("AI-режим: ошибка конфигурации — %s", e)
        await status.edit_text(f"❌ Ошибка AI-режима:\n\n{e}\n\nПроверьте настройки в .env файле.")
    except Exception as e:
        log.exception("AI-режим упал")
        await status.edit_text(f"Не удалось собрать ролик: {e}")
    finally:
        # Превью-файл не удаляем — он нужен для публикации
        pass


# ── Callback-обработчик кнопок ────────────────────────────────
async def on_callback(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    user = update.effective_user

    if user.id not in ALLOWED_IDS:
        await query.edit_message_text("Доступ запрещён.")
        return

    action, *rest = query.data.split(":")
    job = rest[0]
    meta = ctx.bot_data.get(f"job:{job}")

    if not meta:
        await query.edit_message_text("Сессия устарела. Начните заново.")
        return

    if action == "publish":
        await query.edit_message_text("Загружаю на YouTube…")
        try:
            body = {
                "snippet": {
                    "title": meta["title"],
                    "description": f"Сгенерировано из идеи: {meta['idea']}",
                    "tags": DEFAULT_TAGS,
                    "categoryId": "22",
                },
                "status": {
                    "privacyStatus": PRIVACY,
                    "selfDeclaredMadeForKids": False,
                },
            }
            media = MediaFileUpload(meta["video_path"], mimetype="video/mp4", resumable=True)
            request = youtube_client().videos().insert(
                part="snippet,status", body=body, media_body=media)

            resp = None
            while resp is None:
                _, resp = request.next_chunk()

            link = f"https://www.youtube.com/shorts/{resp['id']}"
            log.info("AI-ролик опубликован: %s (%s)", link, PRIVACY)
            await query.edit_message_text(f"Готово! Shorts опубликован ({PRIVACY}):\n{link}")

        except Exception as e:
            await query.edit_message_text(f"Ошибка загрузки: {e}")
        finally:
            # Чистим временные файлы
            for f in os.listdir(WORKDIR):
                if f.startswith(job):
                    os.remove(os.path.join(WORKDIR, f))
            del ctx.bot_data[f"job:{job}"]

    elif action == "retry":
        idea = rest[1]
        await query.edit_message_text("Переснимаю с новым ракурсом…")
        # Удаляем старый файл
        for f in os.listdir(WORKDIR):
            if f.startswith(job):
                os.remove(os.path.join(WORKDIR, f))
        del ctx.bot_data[f"job:{job}"]

        # Рекурсивно вызываем on_idea с той же идеей
        update.message.text = idea
        await on_idea(update, ctx)


# ── /start и /help ────────────────────────────────────────────
async def start(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if update.effective_user.id not in ALLOWED_IDS:
        await update.message.reply_text(f"Доступ запрещён. Ваш id: {update.effective_user.id}")
        return

    await update.message.reply_text(
        "👋 Привет! Я ShortsFlow — бот для автопубликации Shorts.\n\n"
        "📹 Видео-режим: отправьте мне видео с подписью — я опубликую его в Shorts.\n\n"
        "📸 Фото: отправьте фото с лицом — я сохраню его и буду использовать вашу внешность "
        "при генерации видео в AI-режиме.\n\n"
        "🤖 AI-режим: напишите идею парой строк — я сделаю ролик из сценария, кадров и озвучки. "
        "Если вы отправили фото, персонаж будет похож на вас. "
        "Вы получите превью и сможете решить: опубликовать или переснять."
    )


# ── Точка входа ───────────────────────────────────────────────
def main():
    app = Application.builder().token(BOT_TOKEN).build()

    # Команды
    app.add_handler(MessageHandler(filters.COMMAND, start))

    # Видео-режим
    app.add_handler(MessageHandler(filters.VIDEO | filters.Document.VIDEO, on_video))

    # Фото: извлекаем лицо для AI-режима
    app.add_handler(MessageHandler(filters.PHOTO, on_photo))

    # AI-режим: любой текст
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, on_idea))

    # Callback-кнопки
    app.add_handler(CallbackQueryHandler(on_callback))

    log.info("ShortsFlow запущен. Жду видео и идеи от id=%s", ALLOWED_IDS)
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
