"""ShortsFlow — приватный Telegram-бот: видео → YouTube Shorts + AI-режим.

Два режима:
  · видео — кидаете файл: бот режет до 60 c, кадрирует в 9:16, публикует.
  · AI    — кидаете идею парой строк: бот пишет сценарий (LLM), собирает
            ролик из кадров и озвучки, присылает превью и публикует
            в Shorts только после вашей кнопки «Опубликовать».

Запуск:  python main.py   (Python 3.10+, ffmpeg в PATH)
Первый запуск откроет браузер для выдачи доступа к YouTube —
далее токен хранится в token.json и обновляется автоматически.
"""

import json
import logging
import os
import subprocess
import uuid

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import (Application, CallbackQueryHandler, ContextTypes,
                          MessageHandler, filters)

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaFileUpload

from ai_pipeline import expand_script, build_video

# ── Настройки (из окружения, см. .env) ────────────────────────
BOT_TOKEN    = os.environ["BOT_TOKEN"]
ALLOWED_IDS  = {int(x) for x in os.environ["ALLOWED_IDS"].split(",")}
PRIVACY      = os.environ.get("PRIVACY", "unlisted")  # private|unlisted|public
DEFAULT_TAGS = [t for t in os.environ.get("DEFAULT_TAGS", "shorts").split(",") if t]
MAX_SECONDS  = int(os.environ.get("MAX_SECONDS", "58"))
WORKDIR      = "tmp"

SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
log = logging.getLogger("shortsflow")

# превью AI-режима, ожидающие решения: chat_id -> (файл, заголовок, идея)
PENDING: dict[int, tuple[str, str, str]] = {}


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


# ── Публикация на канал (общая для обоих режимов) ─────────────
def publish(path: str, title: str, description: str) -> str:
    if "#shorts" not in title.lower():
        title += " #Shorts"
    body = {
        "snippet": {
            "title": title[:95],
            "description": description,
            "tags": DEFAULT_TAGS,
            "categoryId": "22",  # People & Blogs
        },
        "status": {
            "privacyStatus": PRIVACY,
            "selfDeclaredMadeForKids": False,
        },
    }
    media = MediaFileUpload(path, mimetype="video/mp4", resumable=True)
    request = youtube_client().videos().insert(
        part="snippet,status", body=body, media_body=media)
    resp = None
    while resp is None:  # resumable-загрузка чанками
        _, resp = request.next_chunk()
    link = f"https://www.youtube.com/shorts/{resp['id']}"
    log.info("Опубликовано: %s (%s)", link, PRIVACY)
    return link


# ── Режим 1: входящее видео ───────────────────────────────────
async def on_video(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    msg = update.message
    user = update.effective_user

    if user.id not in ALLOWED_IDS:
        log.warning("Отклонён чужой запрос: %s (id=%s)", user.full_name, user.id)
        await msg.reply_text(f"Доступ запрещён. Ваш id: {user.id}")
        return

    video = msg.video or msg.document
    if video.file_size and video.file_size > 20 * 1024 * 1024:
        await msg.reply_text(
            "Файл больше 20 МБ — облачный Bot API его не отдаст. "
            "Сожмите ролик или поднимите локальный Bot API-сервер (до 2 ГБ).")
        return

    status = await msg.reply_text("Принял видео. Скачиваю файл…")
    job = uuid.uuid4().hex[:8]
    os.makedirs(WORKDIR, exist_ok=True)
    src = f"{WORKDIR}/{job}_src.mp4"

    try:
        tg_file = await ctx.bot.get_file(video.file_id)
        await tg_file.download_to_drive(src)
        duration, w, h = probe(src)

        if duration > MAX_SECONDS:  # режем до лимита Shorts
            await status.edit_text(f"Ролик на {duration:.0f} c — режу до {MAX_SECONDS} c…")
            cut = f"{WORKDIR}/{job}_cut.mp4"
            ffmpeg(["-i", src, "-t", str(MAX_SECONDS),
                    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
                    "-c:a", "aac", cut])
            src = cut

        if w > h:  # горизонталь → вертикаль 9:16 (кроп по центру)
            await status.edit_text("Кадрирую в вертикаль 9:16…")
            vert = f"{WORKDIR}/{job}_vert.mp4"
            ffmpeg(["-i", src, "-vf", "crop=ih*9/16:ih,scale=1080:1920",
                    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
                    "-c:a", "aac", vert])
            src = vert

        title = (msg.caption or "Shorts из Telegram").strip()
        await status.edit_text("Загружаю на YouTube…")
        link = publish(src, title, msg.caption or "Опубликовано ботом ShortsFlow")
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


# ── Режим 2: идея → сценарий → видео → превью ─────────────────
async def produce(chat_id: int, reply_to, idea: str) -> None:
    """Вся AI-цепочка. Публикации здесь нет — только превью с кнопками."""
    status = await reply_to.reply_text("Пишу сценарий…")
    try:
        script = await expand_script(idea)
        scenes = "\n".join(
            f"{i + 1}. {s['voiceover']}" for i, s in enumerate(script["scenes"]))
        await status.edit_text(
            f"Сценарий готов · {len(script['scenes'])} сцены:\n{scenes}\n\n"
            "Собираю видео: кадры → озвучка → склейка…")

        async def progress(label, pct):
            await status.edit_text(f"{label} · {pct}%")

        path, title = await build_video(script, progress)
        PENDING[chat_id] = (path, title, idea)
        kb = InlineKeyboardMarkup([[
            InlineKeyboardButton("Опубликовать в Shorts", callback_data="ai:publish"),
            InlineKeyboardButton("Ещё дубль", callback_data="ai:retry"),
        ]])
        await reply_to.reply_video(
            open(path, "rb"), caption=f"{title} #Shorts", reply_markup=kb)
        await status.delete()
    except Exception as e:
        log.exception("AI-режим")
        await status.edit_text(f"AI-режим не справился: {e}")


async def on_idea(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if update.effective_user.id not in ALLOWED_IDS:
        return
    idea = update.message.text.strip()
    if len(idea) < 15:
        await update.message.reply_text(
            "Опишите идею чуть подробнее — хотя бы пару строк, "
            "и я распишу её в сценарий и соберу ролик.")
        return
    await produce(update.effective_chat.id, update.message, idea)


async def on_verdict(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    """Кнопки под превью: публикация или пересъёмка."""
    q = update.callback_query
    await q.answer()
    chat = q.effective_chat.id
    if chat not in PENDING:
        await q.edit_message_caption("Превью уже неактуально — пришлите идею заново.")
        return
    path, title, idea = PENDING.pop(chat)

    if q.data == "ai:retry":
        os.remove(path)
        await q.edit_message_caption("Снял с публикации. Переснимаю…")
        await produce(chat, q.message, idea + " (другой дубль — смени ракурс и темп)")
        return

    try:
        await q.edit_message_caption("Публикую на YouTube…")
        link = publish(path, title, f"Сценарий: {idea}\n\nСобрано AI-режимом ShortsFlow")
        os.remove(path)
        await q.edit_message_caption(f"Опубликовано ({PRIVACY}): {link}")
    except HttpError as e:
        await q.edit_message_caption(f"Ошибка YouTube {e.status_code}: {e.reason}")


def main():
    app = Application.builder().token(BOT_TOKEN).build()
    app.add_handler(MessageHandler(filters.VIDEO | filters.Document.VIDEO, on_video))
    app.add_handler(CallbackQueryHandler(on_verdict, pattern="^ai:"))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, on_idea))
    log.info("ShortsFlow запущен: видео-режим + AI-режим. id=%s", ALLOWED_IDS)
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
