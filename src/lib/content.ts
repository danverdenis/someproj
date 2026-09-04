/* ── Данные проекта ShortsFlow ─────────────────────────────── */

export const MAIN_PY = `"""ShortsFlow — приватный Telegram-бот: видео → YouTube Shorts + AI-режим.

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
        await status.edit_text(f"Готово! Shorts опубликован ({PRIVACY}):\\n{link}")

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
        scenes = "\\n".join(
            f"{i + 1}. {s['voiceover']}" for i, s in enumerate(script["scenes"]))
        await status.edit_text(
            f"Сценарий готов · {len(script['scenes'])} сцены:\\n{scenes}\\n\\n"
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
        link = publish(path, title, f"Сценарий: {idea}\\n\\nСобрано AI-режимом ShortsFlow")
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
`;

export const AI_PIPELINE_PY = `"""AI-цепочка ShortsFlow: идея → сценарий → кадры → озвучка → склейка.

Полностью бесплатный стек:
  · LLM    — Groq / Gemini / OpenRouter (любой OpenAI-совместимый эндпоинт)
  · кадры  — Pollinations.ai (без ключа, сразу в 9:16)
  · голос  — edge-tts (нейроголоса Microsoft, бесплатно)
  · склейка — ffmpeg локально: Ken Burns на кадрах + звуковая дорожка

build_video(script, progress) -> (путь к preview.mp4, заголовок)
Хотите настоящий нейровидеогенератор (Runway / Kling / Veo)? Замените
тело build_video — интерфейс тот же: сценарий на входе, mp4 на выходе.
"""
import asyncio
import json
import os
import random
import urllib.parse

import aiohttp
import edge_tts

SCRIPT_API_URL = os.getenv("SCRIPT_API_URL",
                           "https://api.groq.com/openai/v1/chat/completions")
SCRIPT_API_KEY = os.getenv("SCRIPT_API_KEY", "")
SCRIPT_MODEL   = os.getenv("SCRIPT_MODEL", "llama-3.3-70b-versatile")
TTS_VOICE      = os.getenv("TTS_VOICE", "ru-RU-SvetlanaNeural")
SCENE_COUNT    = int(os.getenv("SCENE_COUNT", "4"))
SCENE_SECONDS  = 10  # ~40 c на 4 сцены — безопасный хронометраж для Shorts
POLLINATIONS   = ("https://image.pollinations.ai/prompt/{p}"
                  "?width=720&height=1280&nologo=true&seed={seed}")

SYSTEM = (
    "Ты — сценарист вертикальных Shorts (до 50 секунд, хук в первые 3 секунды). "
    f"Верни строго JSON без markdown: "
    "{\\"title\\": \\"до 60 символов\\", \\"scenes\\": "
    "[{\\"image_prompt\\": \\"описание кадра, english, vertical 9:16\\", "
    "\\"voiceover\\": \\"8-12 слов, русский\\"}]}"
    f" — ровно {SCENE_COUNT} сцены."
)


async def expand_script(idea: str) -> dict:
    """Пара строк пользователя → полноценный сценарий через бесплатную LLM."""
    payload = {
        "model": SCRIPT_MODEL,
        "temperature": 0.9,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": idea},
        ],
    }
    async with aiohttp.ClientSession() as s:
        async with s.post(
            SCRIPT_API_URL, json=payload,
            headers={"Authorization": f"Bearer {SCRIPT_API_KEY}"},
            timeout=aiohttp.ClientTimeout(total=60),
        ) as r:
            r.raise_for_status()
            raw = (await r.json())["choices"][0]["message"]["content"]
    script = json.loads(raw)
    script["scenes"] = script["scenes"][:SCENE_COUNT]
    return script


async def _image(s: aiohttp.ClientSession, prompt: str, path: str):
    url = POLLINATIONS.format(p=urllib.parse.quote(prompt),
                              seed=random.randint(1, 10**6))
    async with s.get(url, timeout=aiohttp.ClientTimeout(total=150)) as r:
        r.raise_for_status()
        with open(path, "wb") as f:
            f.write(await r.read())


async def _voice(text: str, path: str):
    await edge_tts.Communicate(text, TTS_VOICE).save(path)


async def build_video(script: dict, progress) -> tuple[str, str]:
    """Кадры (Pollinations) + голос (edge-tts) → склейка ffmpeg (Ken Burns)."""
    scenes = script["scenes"]
    tag = random.randint(10**5, 10**6 - 1)
    wd = f"renders/{tag}"
    os.makedirs(wd, exist_ok=True)

    # 1) кадры и озвучка — параллельно
    async with aiohttp.ClientSession() as s:
        jobs = []
        for i, sc in enumerate(scenes):
            jobs.append(_image(s, sc["image_prompt"], f"{wd}/f{i}.png"))
            jobs.append(_voice(sc["voiceover"], f"{wd}/v{i}.mp3"))
        done = 0
        for job in asyncio.as_completed(jobs):
            await job
            done += 1
            await progress("Кадры + озвучка", round(done / len(jobs) * 100))

    # 2) медленный наезд на каждом кадре + дорожки подряд
    vf = [
        f"[{i}:v]scale=1080:1920:force_original_aspect_ratio=increase,"
        f"crop=1080:1920,zoompan=z='min(zoom+0.0012,1.22)':"
        f"d={SCENE_SECONDS * 25}:s=1080x1920,fps=25,setsar=1[v{i}]"
        for i in range(len(scenes))
    ]
    vf.append("".join(f"[v{i}]" for i in range(len(scenes)))
              + f"concat=n={len(scenes)}:v=1:a=0[outv]")
    amap = "".join(f"[{len(scenes) + i}:a]" for i in range(len(scenes)))

    cmd = ["ffmpeg", "-y"]
    for i in range(len(scenes)):
        cmd += ["-loop", "1", "-t", str(SCENE_SECONDS), "-i", f"{wd}/f{i}.png"]
    for i in range(len(scenes)):
        cmd += ["-i", f"{wd}/v{i}.mp3"]
    out = f"{wd}/preview.mp4"
    cmd += ["-filter_complex",
            ";".join(vf) + f";{amap}concat=n={len(scenes)}:v=0:a=1[outa]",
            "-map", "[outv]", "-map", "[outa]",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "21",
            "-c:a", "aac", "-shortest", out]

    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.DEVNULL)
    await proc.communicate()
    await progress("Склейка видео", 100)
    return out, script["title"]
`;

export const REQUIREMENTS_TXT = `python-telegram-bot==21.6
google-api-python-client==2.154.0
google-auth-oauthlib==1.2.1
aiohttp==3.11.10
edge-tts==7.0.0
`;

export const ENV_EXAMPLE = `# Скопируйте в .env и заполните своими значениями
BOT_TOKEN=123456789:AAE-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
ALLOWED_IDS=123456789            # ваш chat_id, несколько — через запятую
PRIVACY=unlisted                 # private | unlisted | public
DEFAULT_TAGS=shorts,автопостинг  # теги для каждого ролика
MAX_SECONDS=58                   # бот обрежет всё, что длиннее

# --- AI-режим (опционально) ---
SCRIPT_API_URL=https://api.groq.com/openai/v1/chat/completions
SCRIPT_API_KEY=gsk_xxxxxxxxxxxxxxxx   # Groq | Gemini | OpenRouter
SCRIPT_MODEL=llama-3.3-70b-versatile
SCENE_COUNT=4                          # сцен в ролике (каждая ~10 c)
TTS_VOICE=ru-RU-SvetlanaNeural         # нейроголос edge-tts
`;

export const SYSTEMD_SERVICE = `# /etc/systemd/system/shortsflow.service
[Unit]
Description=ShortsFlow — Telegram → YouTube Shorts (+ AI-режим)
After=network-online.target

[Service]
WorkingDirectory=/opt/shortsflow
EnvironmentFile=/opt/shortsflow/.env
ExecStart=/usr/bin/python3 main.py
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target

# Активация:
#   sudo systemctl daemon-reload
#   sudo systemctl enable --now shortsflow
#   journalctl -u shortsflow -f      # живой лог
`;

export interface CodeFile {
  name: string;
  lang: string;
  note: string;
  content: string;
}

export const CODE_FILES: CodeFile[] = [
  { name: "main.py", lang: "python", note: "весь бот: видео-режим + AI-режим с кнопками", content: MAIN_PY },
  { name: "ai_pipeline.py", lang: "python", note: "AI-цепочка: LLM → кадры → голос → ffmpeg", content: AI_PIPELINE_PY },
  { name: "requirements.txt", lang: "text", note: "пять зависимостей, ставятся одной командой", content: REQUIREMENTS_TXT },
  { name: ".env.example", lang: "ini", note: "секреты и поведение — вне кода", content: ENV_EXAMPLE },
  { name: "shortsflow.service", lang: "systemd", note: "автозапуск на сервере + рестарт при падении", content: SYSTEMD_SERVICE },
];

/* ── Шаги установки ───────────────────────────────────────── */

export interface Step {
  id: string;
  num: string;
  title: string;
  text: string;
  points?: string[];
  code?: string;
  codeLang?: string;
}

export const STEPS: Step[] = [
  {
    id: "botfather",
    num: "01",
    title: "Создайте бота в BotFather",
    text: "Откройте @BotFather в Telegram, отправьте /newbot, придумайте имя и логин (должен заканчиваться на bot). В ответ придёт токен — он и есть ключ от бота.",
    code: `/newbot
Имя:   ShortsFlow Bot
Логин: shortsflow_pipe_bot
→ токен: 123456789:AAE-...   # сохраните, показывается один раз`,
    codeLang: "telegram",
  },
  {
    id: "chatid",
    num: "02",
    title: "Узнайте свой chat_id",
    text: "Это основа приватности: бот будет отвечать только тем id, что перечислены в ALLOWED_IDS. Чужие запросы отклоняются и логируются.",
    code: `# Напишите любое сообщение боту @userinfobot —
# он мгновенно вернёт ваш id, например:
Id: 123456789`,
    codeLang: "telegram",
    points: ["id попадает в .env и больше нигде не светится", "можно добавить жену/брата/напарника — просто допишите id через запятую"],
  },
  {
    id: "google",
    num: "03",
    title: "Включите YouTube Data API v3",
    text: "В Google Cloud Console создайте проект, включите YouTube Data API v3 и сделайте OAuth-клиент типа «Desktop app». Скачанный credentials.json положите рядом с main.py.",
    points: [
      "APIs & Services → Library → YouTube Data API v3 → Enable",
      "OAuth consent screen: тип External, себя добавьте в Test users",
      "Credentials → Create OAuth client ID → Desktop app → скачать JSON",
    ],
    code: `console.cloud.google.com
  → проект: shortsflow
  → Library → "YouTube Data API v3" → Enable
  → Credentials → OAuth client ID → Desktop app
  → скачать credentials.json`,
    codeLang: "путь",
  },
  {
    id: "server",
    num: "04",
    title: "Подготовьте машину",
    text: "Подойдёт любой VPS за ~200 ₽/мес, Raspberry Pi или старый ноутбук. Нужны Python 3.10+ и ffmpeg — он режет видео и склеивает AI-ролики.",
    code: `sudo apt update && sudo apt install -y ffmpeg python3-pip
mkdir /opt/shortsflow && cd /opt/shortsflow
pip install -r requirements.txt`,
    codeLang: "bash",
  },
  {
    id: "run",
    num: "05",
    title: "Первый запуск и OAuth",
    text: "Запустите бота — при первом видео откроется браузер с экраном входа Google: разрешите доступ к загрузке на канал. Токен сохранится в token.json и дальше обновляется сам.",
    code: `export $(grep -v '^#' .env | xargs)
python main.py
# → откроется браузер: войдите в Google и разрешите доступ
# → появился token.json — больше авторизация не нужна`,
    codeLang: "bash",
    points: ["scope минимальный: только youtube.upload — ничего не читает", "если машина без браузера — пройдите авторизацию локально и скопируйте token.json"],
  },
  {
    id: "test",
    num: "06",
    title: "Отправьте первое видео",
    text: "Киньте боту вертикальный ролик с подписью. Через минуту бот вернёт ссылку на Shorts, а видео появится на канале с нужным статусом доступа.",
    code: `вы  → матч_моменты.mp4 «гол на 90+4»
бот → Принял видео. Скачиваю файл…
бот → Загружаю на YouTube…
бот → Готово! Shorts опубликован (unlisted):
      https://www.youtube.com/shorts/Xt9Kq2m`,
    codeLang: "чат",
  },
  {
    id: "aimode",
    num: "07",
    title: "AI-режим (опционально)",
    text: "Для режима «идея → ролик» нужен бесплатный ключ LLM. Проще всего Groq: регистрация на console.groq.com, создать API key, вписать в .env. Кадры и голос уже бесплатны и ключей не просят.",
    code: `# добавьте в .env:
SCRIPT_API_URL=https://api.groq.com/openai/v1/chat/completions
SCRIPT_API_KEY=gsk_xxxxxxxxxxxxxxxx
SCRIPT_MODEL=llama-3.3-70b-versatile

# и отправьте боту просто текст:
вы → «короткая история про кота-космонавта,
      который проснулся, а корабль пропал»`,
    codeLang: "bash",
    points: [
      "Groq free tier — сотни запросов в день, ответ за 2–4 секунды",
      "Gemini (aistudio.google.com) и OpenRouter тоже подойдут: смените SCRIPT_API_URL и модель",
      "публикация — только после кнопки «Опубликовать» под превью",
    ],
  },
];

/* ── Конвейер: два режима ─────────────────────────────────── */

export interface Stage {
  num: string;
  title: string;
  desc: string;
  tags: string[];
  tone: "tg" | "amber" | "yt" | "ok";
}

export const STAGES_DIRECT: Stage[] = [
  {
    num: "01",
    title: "Приём в Telegram",
    desc: "Бот ловит видео в личке через long-polling. Проверяет, что отправитель в белом списке, а файл не больше 20 МБ (лимит облачного Bot API).",
    tags: ["whitelist", "get_file", "20 МБ"],
    tone: "tg",
  },
  {
    num: "02",
    title: "Обработка ffmpeg",
    desc: "Всё, что длиннее 58 секунд, обрезается. Горизонтальное видео кадрируется по центру в вертикаль 9:16 и масштабируется до 1080×1920.",
    tags: ["crop 9:16", "1080×1920", "≤ 60 c"],
    tone: "amber",
  },
  {
    num: "03",
    title: "Публикация в Shorts",
    desc: "Resumable-загрузка через YouTube Data API v3. Заголовок — из подписи в Telegram, в конец добавляется #Shorts, статус доступа — из .env.",
    tags: ["OAuth 2.0", "#Shorts", "privacy"],
    tone: "yt",
  },
];

export const STAGES_AI: Stage[] = [
  {
    num: "01",
    title: "Идея в чате",
    desc: "Вместо файла — пара строк текста. Текстовый хендлер понимает, что это не команда и не видео, и запускает AI-цепочку.",
    tags: ["текст ≥ 15 символов", "whitelist"],
    tone: "tg",
  },
  {
    num: "02",
    title: "Сценарий · LLM",
    desc: "Groq (Llama 3.3) или Gemini расписывает идею в JSON-сценарий: заголовок, сцены, описание каждого кадра и текст озвучки. Бесплатный тариф.",
    tags: ["JSON schema", "2–4 c", "0 ₽"],
    tone: "amber",
  },
  {
    num: "03",
    title: "Кадры + голос",
    desc: "Pollinations.ai рисует кадры сразу в 9:16 — без ключа, одним GET-запросом на сцену. edge-tts начитывает озвучку нейроголосом Microsoft.",
    tags: ["Pollinations", "edge-tts", "параллельно"],
    tone: "ok",
  },
  {
    num: "04",
    title: "Превью и решение",
    desc: "ffmpeg склеивает кадры с эффектом Ken Burns под дорожку (~40 c) и бот присылает видео вам. Дальше — только ваши кнопки: «Опубликовать» или «Ещё дубль».",
    tags: ["zoompan", "кнопки", "вы решаете"],
    tone: "tg",
  },
  {
    num: "05",
    title: "Shorts по кнопке",
    desc: "После «Опубликовать» — та же проверенная загрузка через YouTube Data API: #Shorts в заголовке, статус доступа из .env, ссылка в чат.",
    tags: ["OAuth 2.0", "#Shorts", "unlisted"],
    tone: "yt",
  },
];

/* ── Бесплатный AI-стек ───────────────────────────────────── */

export interface StackItem {
  name: string;
  role: string;
  price: string;
  note: string;
  tone: "amber" | "ok" | "tg";
}

export const AI_STACK: StackItem[] = [
  {
    name: "Groq · Llama 3.3 70B",
    role: "сценарий из пары строк",
    price: "0 ₽ · free tier",
    note: "ключ на console.groq.com · Gemini и OpenRouter подключаются сменой URL",
    tone: "amber",
  },
  {
    name: "Pollinations.ai",
    role: "кадры 9:16 по промптам сцен",
    price: "0 ₽ · без ключа",
    note: "GET-запрос с промптом → PNG 720×1280 · seed меняется на каждом дубле",
    tone: "ok",
  },
  {
    name: "edge-tts",
    role: "нейроозвучка по-русски",
    price: "0 ₽ · голоса Microsoft",
    note: "ru-RU-SvetlanaNeural, DmitryNeural, DariyaNeural — голос выбирается в .env",
    tone: "tg",
  },
  {
    name: "ffmpeg · локально",
    role: "Ken Burns + склейка + звук",
    price: "0 ₽ · ваша машина",
    note: "есть ключ Runway / Kling / Veo? замена одного build_video() — и нейровидео в потоке",
    tone: "amber",
  },
];

/* ── FAQ ──────────────────────────────────────────────────── */

export interface FaqItem {
  q: string;
  a: string;
}

export const FAQ: FaqItem[] = [
  {
    q: "Какая нейросеть пишет сценарии и сколько это стоит?",
    a: "По умолчанию — Groq с Llama 3.3 70B на бесплатном тарифе: сотни запросов в день, ответ за 2–4 секунды. Эндпоинт OpenAI-совместимый, поэтому в .env меняется SCRIPT_API_URL — и подойдут Gemini (бесплатный тариф AI Studio) или бесплатные модели OpenRouter. Сценарий возвращается строго JSON-ом: заголовок и сцены с промптом кадра и текстом озвучки.",
  },
  {
    q: "Генерация видео правда бесплатная? А как же Sora и Runway?",
    a: "Честно: стабильных полностью бесплатных API нейровидео нет. Бот собирает ролик из того, что бесплатно всегда: кадры от Pollinations (без ключа), озвучка edge-tts и склейка с эффектом Ken Burns в ffmpeg. Выглядит как динамичный слайд-шоу-Shorts с закадровым голосом. Если появятся ключи Runway, Kling, Luma или Veo — меняется только тело функции build_video(): интерфейс тот же, сценарий на входе, mp4 на выходе.",
  },
  {
    q: "Сколько времени занимает AI-цепочка?",
    a: "40–90 секунд целиком: сценарий 2–4 c, четыре кадра в Pollinations 15–30 c (рисуются параллельно), озвучка ~5 c, склейка ffmpeg 10–20 c и загрузка на YouTube ~10 c. Весь прогресс бот показывает в чате процентами.",
  },
  {
    q: "Что если видео не понравилось?",
    a: "Ничего не публикуется без вашего согласия: под превью две кнопки. «Ещё дубль» — бот переписывает сценарий с новым ракурсом, перерисовывает кадры с новым seed и присылает другой вариант; старый файл удаляется. «Опубликовать в Shorts» — единственная дорога на канал.",
  },
  {
    q: "Ролик попал в обычные видео, а не в Shorts. Почему?",
    a: "YouTube относит ролик к Shorts, если он вертикальный (9:16) и не длиннее 60 секунд. Бот гарантирует оба условия: обрезает до 58 секунд и кадрирует горизонталь по центру. Дополнительно в заголовок подставляется #Shorts. С октября 2024 Shorts могут быть и до 3 минут, но 60 секунд — железобетонный вариант.",
  },
  {
    q: "Какой максимальный размер файла?",
    a: "Облачный Telegram Bot API отдаёт файлы до 20 МБ — этого хватает для минуты видео в 1080p. Если нужно больше, поднимите локальный Bot API-сервер (официальный Docker-образ) — лимит вырастет до 2 ГБ, в коде бота менять ничего не придётся.",
  },
  {
    q: "Сколько видео можно публиковать в день?",
    a: "Квота YouTube Data API — 10 000 единиц в сутки, одна загрузка стоит 1 600. Это примерно 6 Shorts в день на проект. Для личного конвейера более чем достаточно; если нужно больше — подаётся заявка Google на расширение квоты.",
  },
  {
    q: "Бот правда отвечает только мне?",
    a: "Да. В ALLOWED_IDS перечислены разрешённые chat_id — все остальные получают «Доступ запрещён» и записываются в лог с именем и id. Токен бота и OAuth-токены лежат только на вашей машине; наружу бот сам ничего не отправляет, кроме загрузки на ваш канал.",
  },
  {
    q: "Где держать бота, чтобы он работал 24/7?",
    a: "Любой VPS с 1 ГБ RAM: бот в простое почти ничего не потребляет. В комплекте systemd-юнит — бот стартует при загрузке сервера и перезапускается при падении. Логи смотрятся через journalctl -u shortsflow -f.",
  },
  {
    q: "Как сменить YouTube-аккаунт или выдать доступ ещё одному?",
    a: "Удалите token.json и отправьте боту любое видео — авторизация пройдёт заново, можно выбрать другой аккаунт Google. Несколько каналов одновременно в этой версии не поддерживаются: один бот = один канал (но можно запустить два экземпляра в разных папках).",
  },
];

/* ── Лимиты и безопасность ────────────────────────────────── */

export interface LimitRow {
  label: string;
  value: string;
  note: string;
}

export const LIMITS: LimitRow[] = [
  { label: "Длительность Shorts", value: "≤ 60 c", note: "бот режет до 58 c с запасом" },
  { label: "Формат кадра", value: "9:16", note: "горизонталь кадрируется по центру" },
  { label: "Файл через Bot API", value: "20 МБ", note: "локальный Bot API-сервер → 2 ГБ" },
  { label: "Загрузок в сутки", value: "≈ 6", note: "1 600 из 10 000 единиц квоты" },
  { label: "AI-сценарий", value: "2–4 c", note: "Groq / Gemini / OpenRouter — free tier" },
  { label: "AI-ролик целиком", value: "40–90 c", note: "кадры + голос + склейка, затем превью" },
  { label: "Доступ к боту", value: "whitelist", note: "только chat_id из ALLOWED_IDS" },
];

/* ── Лог-лента ────────────────────────────────────────────── */

export const LOG_LINES = [
  "14:02:11  video_042.mp4 получен · 12,4 МБ · от id 123456789",
  "14:02:15  ffprobe: 47,2 c · 1920×1080 → crop 9:16",
  "14:02:31  загрузка 100% · id=Xt9Kq2m · unlisted ✓",
  "15:40:02  ai-режим · идея: «кот-космонавт ищет корабль»",
  "15:40:05  groq llama-3.3-70b · сценарий 4 сцены · 2,8 c",
  "15:40:23  pollinations: 4/4 кадра 720×1280 · 18,2 c",
  "15:40:28  edge-tts · ru-RU-SvetlanaNeural · 4 дорожки",
  "15:40:44  ffmpeg zoompan → preview.mp4 (38,4 c)",
  "15:41:12  кнопка ai:publish · youtube insert · id=Me0w9X4 ✓",
];
