# ShortsFlow

**Приватный Telegram-бот, который публикует видео в YouTube Shorts.**

`Python 3.10+` · `ffmpeg` · `OAuth 2.0` · `MIT`

Два режима работы:

1. **Видео** — кидаете боту файл в личку, он обрезает до 60 секунд, кадрирует в вертикаль 9:16 и публикует на ваш канал как Shorts.
2. **AI** — пишете идею парой строк. Бесплатная LLM (Groq / Gemini) пишет сценарий, Pollinations рисует кадры, edge-tts начитывает озвучку, ffmpeg склеивает ролик. Бот присылает **превью**, и публикация происходит только после вашей кнопки «Опубликовать».

Бот отвечает только chat_id из белого списка — всё остальное отклоняется и логируется.

---

## Как это работает

**Видео-режим:**

```
вы: файл.mp4 «подпись»
  → whitelist (chat_id)
  → скачивание через Bot API
  → ffmpeg: обрезка ≤58 c, кроп 9:16, scale 1080×1920
  → YouTube Data API v3 (resumable upload, #Shorts)
вы: ссылка youtube.com/shorts/...
```

**AI-режим:**

```
вы: «короткая история про кота-космонавта»
  → whitelist (chat_id)
  → LLM: пара строк → JSON-сценарий (заголовок + сцены)
  → Pollinations.ai: кадры 9:16 (без ключа)
  → edge-tts: нейроголос по-русски (без ключа)
  → ffmpeg: Ken Burns + склейка + дорожка (~40 c)
  → бот присылает превью
вы: [Опубликовать в Shorts]  или  [Ещё дубль]
  → публикация только после кнопки
```

---

## Структура проекта

```
shortsflow/
├── README.md               # эта инструкция
└── bot/
    ├── main.py             # бот: Telegram, whitelist, публикация, кнопки
    ├── ai_pipeline.py      # AI-цепочка: LLM → кадры → голос → ffmpeg
    ├── requirements.txt    # зависимости
    ├── .env.example        # шаблон настроек (скопировать в .env)
    ├── shortsflow.service  # юнит systemd для работы 24/7
    └── .gitignore          # чтобы секреты не уехали в git
```

---

## Требования

- **Python 3.10+** и pip
- **ffmpeg** (и ffprobe) в PATH — резка, кроп, склейка
- **Аккаунт Telegram** — для создания бота
- **Аккаунт Google** с YouTube-каналом — для публикации
- Любая машина: VPS за ~200 ₽/мес, Raspberry Pi, старый ноутбук

---

## Установка

### 1. Создайте бота в BotFather

Откройте [@BotFather](https://t.me/BotFather) в Telegram:

```
/newbot
Имя:   ShortsFlow Bot
Логин: shortsflow_pipe_bot      # должен заканчиваться на "bot"
```

В ответ придёт **токен** вида `123456789:AAE-xxxx...` — он показывается один раз, сохраните.

### 2. Узнайте свой chat_id

Это основа приватности: бот будет отвечать только перечисленным id.

```
Напишите любое сообщение боту @userinfobot —
он мгновенно вернёт ваш id, например: 123456789
```

### 3. Включите YouTube Data API v3

На [console.cloud.google.com](https://console.cloud.google.com):

1. Создайте проект (например, `shortsflow`).
2. **APIs & Services → Library → YouTube Data API v3 → Enable**.
3. **OAuth consent screen**: тип *External*, в *Test users* добавьте свой Google-аккаунт.
4. **Credentials → Create OAuth client ID → Desktop app**.
5. Скачайте JSON и положите рядом с `main.py` **под именем `credentials.json`**.

### 4. Подготовьте машину

```bash
sudo apt update && sudo apt install -y ffmpeg python3-pip
```

### 5. Установите бота и зависимости

```bash
git clone <ваш-репозиторий> && cd shortsflow/bot
# или просто скопируйте папку bot/ на сервер
pip install -r requirements.txt
```

### 6. Создайте .env

```bash
cp .env.example .env
nano .env
```

| Переменная | Что это | Пример |
|---|---|---|
| `BOT_TOKEN` | Токен из BotFather | `123456789:AAE-...` |
| `ALLOWED_IDS` | Ваш chat_id, несколько — через запятую | `123456789` |
| `PRIVACY` | Статус роликов | `private` / `unlisted` / `public` |
| `DEFAULT_TAGS` | Теги каждого ролика | `shorts,автопостинг` |
| `MAX_SECONDS` | Порог обрезки | `58` |
| `SCRIPT_API_URL` | Эндпоинт LLM (AI-режим) | `https://api.groq.com/openai/v1/chat/completions` |
| `SCRIPT_API_KEY` | Ключ LLM (AI-режим) | `gsk_...` |
| `SCRIPT_MODEL` | Модель LLM | `llama-3.3-70b-versatile` |
| `SCENE_COUNT` | Сцен в AI-ролике | `4` |
| `TTS_VOICE` | Голос озвучки | `ru-RU-SvetlanaNeural` |

### 7. Первый запуск и OAuth

```bash
export $(grep -v '^#' .env | xargs)
python3 main.py
```

При **первом** видео откроется браузер с экраном входа Google — разрешите доступ.
Появится `token.json`: дальше токен обновляется автоматически, логиниться не нужно.

> На машине без браузера пройдите авторизацию локально и скопируйте `token.json` на сервер.

### 8. Проверка

Отправьте боту вертикальный ролик с подписью:

```
вы  → матч_моменты.mp4 «гол на 90+4»
бот → Принял видео. Скачиваю файл…
бот → Загружаю на YouTube…
бот → Готово! Shorts опубликован (unlisted):
      https://www.youtube.com/shorts/Xt9Kq2m
```

Для AI-режима отправьте просто текст:

```
вы  → «короткая история про кота-космонавта, который проснулся,
       а корабль пропал. грустно, но смешно»
бот → Сценарий готов · 4 сцены: ...
бот → [видео-превью]
      [Опубликовать в Shorts]   [Ещё дубль]
```

---

## AI-режим

### Ключ LLM (бесплатно)

Проще всего — **Groq** (сотни запросов в день, ответ за 2–4 секунды):

1. Зарегистрируйтесь на [console.groq.com](https://console.groq.com).
2. **API Keys → Create API Key** → скопируйте ключ `gsk_...` в `.env`.

Альтернативы — любой OpenAI-совместимый эндпоинт, меняется только `.env`:

| Провайдер | `SCRIPT_API_URL` | `SCRIPT_MODEL` |
|---|---|---|
| Groq | `https://api.groq.com/openai/v1/chat/completions` | `llama-3.3-70b-versatile` |
| Gemini | `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions` | `gemini-2.0-flash` |
| OpenRouter | `https://openrouter.ai/api/v1/chat/completions` | `meta-llama/llama-3.3-70b-instruct:free` |

### Что ещё бесплатно

- **Кадры** — Pollinations.ai: GET-запрос с промптом → PNG 720×1280, без ключа.
- **Озвучка** — edge-tts: нейроголоса Microsoft. Голоса: `ru-RU-SvetlanaNeural`, `ru-RU-DmitryNeural`, `ru-RU-DariyaNeural` (поле `TTS_VOICE`).

### Честно про «нейровидео»

Полностью бесплатных API видеогенерации не бывает, поэтому бот собирает динамичный ролик из AI-кадров с эффектом Ken Burns + нейроозвучки. Это бесплатно всегда.

Если появится ключ Runway / Kling / Luma / Veo — замените **только** тело функции `build_video()` в `ai_pipeline.py`: интерфейс тот же — сценарий на входе, `mp4` на выходе. Остальной бот не меняется.

### Кнопки под превью

- **«Опубликовать в Shorts»** — единственная дорога на канал. Без нажатия ничего не публикуется.
- **«Ещё дубль»** — сценарий переписывается с новым ракурсом, кадры перерисовываются с другим seed. Старый файл удаляется.

---

## Запуск как сервис (systemd)

```bash
sudo cp bot/shortsflow.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now shortsflow
```

Живой лог:

```bash
journalctl -u shortsflow -f
```

Юнит стартует бота при загрузке сервера и перезапускает при падении (`Restart=on-failure`). Пути в юните правятся под вашу установку (`WorkingDirectory`, `EnvironmentFile`).

---

## Лимиты и квоты

| Параметр | Значение | Комментарий |
|---|---|---|
| Длительность Shorts | ≤ 60 c | бот режет до 58 c с запасом |
| Формат кадра | 9:16 | горизонталь кадрируется по центру |
| Файл через облачный Bot API | 20 МБ | локальный Bot API-сервер → до 2 ГБ |
| Квота YouTube Data API | 10 000 ед./сутки | одна загрузка = 1 600 ед. ≈ 6 роликов в день |
| AI-сценарий | 2–4 c | Groq / Gemini / OpenRouter, free tier |
| AI-ролик целиком | 40–90 c | кадры + голос + склейка, затем превью |
| Доступ к боту | whitelist | только chat_id из `ALLOWED_IDS` |

---

## Частые проблемы

- **«Ролик попал в обычные видео, а не в Shorts»** — проверьте, что он вертикальный и ≤ 60 c. Бот гарантирует оба условия сам; если меняли `MAX_SECONDS` выше 60 — верните 58.
- **«Файл больше 20 МБ»** — сожмите видео или поднимите официальный локальный Bot API-сервер (Docker) — лимит вырастет до 2 ГБ, код бота менять не нужно.
- **`HttpError 403` от YouTube** — закончилась дневная квота (6 загрузок) или аккаунт не подтверждён. Проверьте [console.cloud.google.com → Quotas](https://console.cloud.google.com).
- **Браузер не открывается при первом запуске** — машина без GUI: авторизуйтесь локально и перенесите `token.json`.
- **Бот молчит** — сверьте `BOT_TOKEN`, убедитесь, что процесс жив (`systemctl status shortsflow`), смотрите лог `journalctl -u shortsflow -f`.
- **AI-режим отвечает ошибкой** — проверьте `SCRIPT_API_KEY` и `SCRIPT_API_URL` (ключ Groq живёт ~90 дней, потом перевыпускается).
- **`ModuleNotFoundError`** — зависимости ставились не в то окружение: `pip install -r requirements.txt` в папке `bot/`.

---

## Безопасность

- `ALLOWED_IDS` — белый список chat_id: чужие запросы отклоняются и пишутся в лог с именем и id.
- OAuth-scope минимальный: только `youtube.upload` — бот не читает почту, диск и аналитику.
- `BOT_TOKEN`, `credentials.json`, `token.json`, `.env` живут только на вашей машине и закрыты `.gitignore`.
- Весь трафик — HTTPS (Bot API и Google API иначе не умеют).
- Ролики помечаются «не для детей» (`selfDeclaredMadeForKids: false`) — так не отключаются комментарии.

---

## Лицензия

MIT — делайте что хотите. Проект не связан с Telegram и YouTube. Ответственность за публикуемый контент — на владельце канала.
