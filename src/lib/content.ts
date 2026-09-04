/* ── Данные проекта ShortsFlow ─────────────────────────────── */

export const MAIN_PY = `"""ShortsFlow — приватный Telegram-бот: видео → YouTube Shorts.

Как работает:
  1. Вы кидаете видео боту в личку.
  2. Бот скачивает файл, режет до 60 c и кадрирует в 9:16 (ffmpeg).
  3. Публикует ролик на ваш YouTube-канал как Shorts (OAuth 2.0).
  4. Присылает ссылку: youtube.com/shorts/...

Запуск:  python main.py   (Python 3.10+, ffmpeg в PATH)
Первый запуск откроет браузер для выдачи доступа к YouTube —
далее токен хранится в token.json и обновляется автоматически.
"""

import json
import logging
import os
import subprocess
import uuid

from telegram import Update
from telegram.ext import Application, ContextTypes, MessageHandler, filters

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaFileUpload

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


def main():
    app = Application.builder().token(BOT_TOKEN).build()
    app.add_handler(MessageHandler(filters.VIDEO | filters.Document.VIDEO, on_video))
    log.info("ShortsFlow запущен. Жду видео от id=%s", ALLOWED_IDS)
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
`;

export const REQUIREMENTS_TXT = `python-telegram-bot==21.6
google-api-python-client==2.154.0
google-auth-oauthlib==1.2.1
`;

export const ENV_EXAMPLE = `# Скопируйте в .env и заполните своими значениями
BOT_TOKEN=123456789:AAE-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
ALLOWED_IDS=123456789            # ваш chat_id, несколько — через запятую
PRIVACY=unlisted                 # private | unlisted | public
DEFAULT_TAGS=shorts,автопостинг  # теги для каждого ролика
MAX_SECONDS=58                   # бот обрежет всё, что длиннее
`;

export const SYSTEMD_SERVICE = `# /etc/systemd/system/shortsflow.service
[Unit]
Description=ShortsFlow — Telegram → YouTube Shorts
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
  { name: "main.py", lang: "python", note: "весь бот — один файл, ~150 строк", content: MAIN_PY },
  { name: "requirements.txt", lang: "text", note: "три зависимости, ставятся одной командой", content: REQUIREMENTS_TXT },
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
    text: "Подойдёт любой VPS за ~200 ₽/мес, Raspberry Pi или старый ноутбук. Нужны Python 3.10+ и ffmpeg — он режет и кадрирует видео.",
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
];

/* ── Конвейер ─────────────────────────────────────────────── */

export interface Stage {
  num: string;
  title: string;
  desc: string;
  tags: string[];
  tone: "tg" | "amber" | "yt";
}

export const STAGES: Stage[] = [
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

/* ── FAQ ──────────────────────────────────────────────────── */

export interface FaqItem {
  q: string;
  a: string;
}

export const FAQ: FaqItem[] = [
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
    a: "Да. В ALLOWED_IDS перечислены разрешённые chat_id — все остальные получают «Доступ запрещён» и записываются в лог с именем и id. Токен бота и OAuth-токены лежат только на вашей машине, наружу бот сам ничего не отправляет, кроме загрузки на ваш канал.",
  },
  {
    q: "Где держать бота, чтобы он работал 24/7?",
    a: "Любой VPS с 1 ГБ RAM: бот в простое почти ничего не потребляет. В комплекте systemd-юнит — бот стартует при загрузке сервера и перезапускается при падении. Логи смотрятся через journalctl -u shortsflow -f.",
  },
  {
    q: "Как сменить YouTube-аккаунт или выдать доступ ещё одному?",
    a: "Удалите token.json и отправьте боту любое видео — авторизация пройдёт заново, можно выбрать другой аккаунт Google. Несколько каналов одновременно в этой версии не поддерживаются: один бот = один канал (но можно запустить два экземпляра в разных папках).",
  },
  {
    q: "Что с авторскими правами и «контентом для детей»?",
    a: "Бот помечает ролики как «не для детей» (selfDeclaredMadeForKids: false) — так они не улетают в детский режим с отключёнными комментариями. Ответственность за контент остаётся на владельце канала: YouTube проверяет Shorts так же, как обычные видео.",
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
  { label: "Доступ к боту", value: "whitelist", note: "только chat_id из ALLOWED_IDS" },
];

/* ── Лог-лента ────────────────────────────────────────────── */

export const LOG_LINES = [
  "14:02:11  video_042.mp4 получен · 12,4 МБ · от id 123456789",
  "14:02:12  проверка whitelist … ok",
  "14:02:15  ffprobe: 47,2 c · 1920×1080 → crop 9:16",
  "14:02:21  scale 1080×1920 · libx264 crf20 … done",
  "14:02:24  youtube.videos.insert · resumable · чанк 3/4",
  "14:02:31  загрузка 100% · id=Xt9Kq2m · unlisted",
  "14:02:32  ответ: youtube.com/shorts/Xt9Kq2m ✓",
  "14:02:32  tmp очищена · ожидание следующего видео…",
];
