"""AI-пайплайн ShortsFlow.

Разворачивает короткую идею в сценарий, рисует кадры, начитывает озвучку
и склеивает всё в вертикальный ролик 9:16.

Стек (всё бесплатно):
  - LLM: Groq (Llama 3.3 70B) / Gemini / OpenRouter — любой OpenAI-совместимый URL
  - Картинки: Pollinations.ai (без ключа)
  - Озвучка: edge-tts (бесплатные голоса Microsoft)
  - Сборка: ffmpeg (Ken Burns + наложение аудио)

Единственная точка подключения платного генератора видео —
функция build_video(). Подмените её на Runway/Kling/Veo при наличии ключа.
"""

import asyncio
import io
import json
import logging
import os
import subprocess
import time
import urllib.request
import urllib.parse
import urllib.error
from concurrent.futures import ThreadPoolExecutor

import numpy as np

log = logging.getLogger("shortsflow.ai")

# ── Работа с лицами ────────────────────────────────────────────
# Пробуем импортировать OpenCV, но не падаем если не удалось
try:
    import cv2
    OPENCV_AVAILABLE = True
    log.info("OpenCV %s загружен успешно", cv2.__version__)
except ImportError as e:
    OPENCV_AVAILABLE = False
    log.warning("OpenCV не установлен: %s. Функция извлечения лица будет недоступна.", e)

# Ленивая инициализация каскада Хаара
_face_cascade = None

def _get_face_cascade():
    """Получает каскад Хаара для обнаружения лиц (ленивая инициализация)."""
    global _face_cascade
    if not OPENCV_AVAILABLE:
        return None
    if _face_cascade is None:
        try:
            cascade_path = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
            _face_cascade = cv2.CascadeClassifier(cascade_path)
            if _face_cascade.empty():
                raise RuntimeError("Не удалось загрузить каскад Хаара")
            log.info("Каскад Хаара загружен успешно")
        except Exception as e:
            log.error("Ошибка загрузки каскада Хаара: %s", e)
            _face_cascade = None
    return _face_cascade

def extract_face(image_path: str, output_path: str) -> bool:
    """Извлекает лицо из фото и сохраняет кроп.
    
    Returns:
        True если лицо найдено и сохранено, False иначе
    """
    if not OPENCV_AVAILABLE:
        log.warning("OpenCV недоступен — извлечение лица пропущено")
        return False
    
    img = cv2.imread(image_path)
    if img is None:
        log.error("Не удалось прочитать изображение: %s", image_path)
        return False
    
    # Конвертируем в grayscale для детекции
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # Детектируем лица с помощью каскада Хаара
    face_cascade = _get_face_cascade()
    faces = face_cascade.detectMultiScale(
        gray,
        scaleFactor=1.1,
        minNeighbors=5,
        minSize=(30, 30)
    )
    
    if len(faces) == 0:
        log.warning("Лицо не найдено в изображении")
        return False
    
    # Берём самое большое лицо (обычно это основное)
    x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
    
    # Добавляем отступы (padding) для лучшего кропа
    padding = 0.3
    x1 = max(0, int(x - w * padding))
    y1 = max(0, int(y - h * padding))
    x2 = min(img.shape[1], int(x + w + w * padding))
    y2 = min(img.shape[0], int(y + h + h * padding))
    
    # Обрезаем лицо
    face_crop = img[y1:y2, x1:x2]
    
    if face_crop.size == 0:
        log.error("Пустой кроп лица")
        return False
    
    cv2.imwrite(output_path, face_crop)
    log.info("Лицо извлечено: %s (%dx%d)", output_path, face_crop.shape[1], face_crop.shape[0])
    return True


def describe_face(face_path: str) -> str:
    """Создаёт текстовое описание лица для использования в промптах.
    
    Анализирует базовые характеристики лица для генерации.
    """
    if not OPENCV_AVAILABLE:
        return ""
    
    img = cv2.imread(face_path)
    if img is None:
        return ""
    
    # Базовый анализ (можно расширить с помощью ML моделей)
    h, w = img.shape[:2]
    
    # Определяем доминирующий цвет кожи (упрощённо)
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    avg_hue = np.mean(hsv[:,:,0])
    
    # Определяем пол по соотношению сторон лица (очень грубо)
    aspect_ratio = w / h if h > 0 else 1
    
    # Простое описание (в реальности можно использовать face analysis библиотеки)
    description_parts = []
    
    # Возраст (по размеру лица относительно кадра - очень приблизительно)
    face_area = w * h
    if face_area > 100000:
        description_parts.append("close-up portrait")
    elif face_area > 50000:
        description_parts.append("headshot")
    else:
        description_parts.append("person")
    
    # Пол (по aspect ratio - очень приблизительно)
    if aspect_ratio > 0.85:
        description_parts.append("male")
    else:
        description_parts.append("female")
    
    # Тон кожи (по hue)
    if avg_hue < 10 or avg_hue > 170:
        description_parts.append("light skin tone")
    elif avg_hue < 20:
        description_parts.append("medium skin tone")
    else:
        description_parts.append("dark skin tone")
    
    return ", ".join(description_parts)


# ── LLM: разворачиваем идею в сценарий ───────────────────────
LLM_ENDPOINTS = {
    "groq": {
        "url": "https://api.groq.com/openai/v1/chat/completions",
        "default_model": "llama-3.3-70b-versatile",
    },
    "gemini": {
        "url": "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
        "default_model": "gemini-2.0-flash",
    },
    "openrouter": {
        "url": "https://openrouter.ai/api/v1/chat/completions",
        "default_model": "meta-llama/llama-3.3-70b-instruct:free",
    },
    # Прокси-провайдеры для обхода региональных ограничений
    "siliconflow": {
        "url": "https://api.siliconflow.cn/v1/chat/completions",
        "default_model": "Qwen/Qwen2.5-72B-Instruct",
    },
    "deepseek": {
        "url": "https://api.deepseek.com/v1/chat/completions",
        "default_model": "deepseek-chat",
    },
}

SYSTEM_PROMPT = """Ты — сценарист коротких вертикальных видео (Shorts/Reels/TikTok).
Получаешь идею от пользователя и разворачиваешь её в сценарий из N сцен.

Требования к ответу — ТОЛЬКО валидный JSON без markdown:
{
  "title": "цепляющий заголовок до 80 символов, с #Shorts в конце",
  "scenes": [
    {
      "visual": "детальное описание кадра на английском для нейросети-художника (что видно, композиция, свет, стиль)",
      "voice": "что говорит диктор в этой сцене на русском, 1-2 предложения",
      "duration": 3
    }
  ]
}

Правила:
- Суммарная длительность сцен ≤ 55 секунд (чтобы уложиться в 60 с Shorts).
- visual пиши на английском, ярко и конкретно — от этого зависит качество картинки.
- voice пиши на русском, живо и разговорно.
- Никакого текста вне JSON."""


def _llm_call(prompt: str, *, provider: str, api_key: str, model: str, scene_count: int) -> dict:
    cfg = LLM_ENDPOINTS.get(provider, LLM_ENDPOINTS["groq"])
    url = cfg["url"]
    model = model or cfg["default_model"]
    
    # Проверка наличия API ключа
    if not api_key:
        raise ValueError(f"API ключ не указан для провайдера {provider}. "
                         f"Добавьте LLM_API_KEY в .env файл")
    
    headers = {"Content-Type": "application/json"}
    headers["Authorization"] = f"Bearer {api_key}"
    
    # Дополнительные заголовки для разных провайдеров
    if provider == "openrouter":
        headers["HTTP-Referer"] = "https://shortsflow.bot"
        headers["X-Title"] = "ShortsFlow Bot"

    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT.replace("N сцен", f"{scene_count} сцен")},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.85,
        "response_format": {"type": "json_object"},
    }

    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    
    # Поддержка HTTP-прокси для обхода региональных ограничений
    proxy_url = os.environ.get("LLM_PROXY", "")
    proxy_handler = None
    if proxy_url:
        log.info("LLM запрос через прокси: %s", proxy_url)
        proxy_handler = urllib.request.ProxyHandler({
            "http": proxy_url,
            "https": proxy_url,
        })
    
    log.info("LLM запрос: %s · модель=%s · провайдер=%s", url, model, provider)
    
    try:
        if proxy_handler:
            opener = urllib.request.build_opener(proxy_handler)
            with opener.open(req, timeout=60) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
        else:
            with urllib.request.urlopen(req, timeout=60) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        # Читаем тело ошибки для диагностики
        error_body = e.read().decode("utf-8", errors="ignore")
        log.error("LLM HTTP ошибка %d: %s\nТело ответа: %s", e.code, e.reason, error_body[:500])
        
        # Понятные сообщения для частых ошибок
        if e.code == 401:
            raise ValueError(f"Неверный API ключ для {provider}. Проверьте LLM_API_KEY в .env")
        elif e.code == 403:
            raise ValueError(
                f"Доступ запрещён для {provider} (региональные ограничения).\n\n"
                f"Решения:\n"
                f"1. Смените провайдера в .env: LLM_PROVIDER=gemini (бесплатный, без блокировок)\n"
                f"2. Или: LLM_PROVIDER=deepseek (работает в большинстве регионов)\n"
                f"3. Или: LLM_PROVIDER=openrouter (проксирует через свои серверы)\n"
                f"4. Или используйте прокси: LLM_PROXY=http://proxy:port в .env\n\n"
                f"Ответ API: {error_body[:200]}"
            )
        elif e.code == 404:
            raise ValueError(f"Модель {model} не найдена у провайдера {provider}. "
                           f"Проверьте LLM_MODEL в .env")
        elif e.code == 429:
            raise ValueError(f"Превышен лимит запросов для {provider}. Подождите или увеличьте квоту")
        else:
            raise ValueError(f"HTTP ошибка {e.code} от {provider}: {e.reason}")
    except urllib.error.URLError as e:
        log.error("LLM сетевая ошибка: %s", e.reason)
        raise ValueError(f"Не удалось подключиться к {provider}: {e.reason}")

    content = payload["choices"][0]["message"]["content"]
    # Парсим JSON, отрезая возможные markdown-обёртки
    content = content.strip()
    if content.startswith("```"):
        content = content.split("\n", 1)[1].rsplit("```", 1)[0].strip()
    return json.loads(content)

def expand_script(idea: str, *, provider: str = "groq", api_key: str = "",
                  model: str = "", scene_count: int = 5) -> dict:
    """Идея → сценарий (JSON с title и scenes)."""
    log.info("LLM: идея=%r · провайдер=%s · модель=%s", idea[:60], provider, model)
    t0 = time.time()
    script = _llm_call(idea, provider=provider, api_key=api_key,
                       model=model, scene_count=scene_count)
    log.info("LLM: готово за %.1f c · %d сцен", time.time() - t0, len(script.get("scenes", [])))

    # Валидация
    if "title" not in script or "scenes" not in script:
        raise ValueError("LLM вернул некорректный JSON")
    if not script["title"].lower().endswith("#shorts"):
        script["title"] = script["title"].rstrip() + " #Shorts"
    return script


# ── Картинки: Pollinations.ai (без ключа) ─────────────────────
def _pollinations_image(prompt: str, *, seed: int = 0, width: int = 720, height: int = 1280,
                        face_description: str = "") -> bytes:
    """Рисует кадр 9:16 через Pollinations. Возвращает JPEG-байты.
    
    Если передано face_description, добавляет его в промпт для сохранения внешности.
    """
    # Если есть описание лица, добавляем его в промпт
    if face_description:
        full_prompt = f"{face_description}, {prompt}, vertical composition 9:16, cinematic lighting, high detail, consistent character"
    else:
        full_prompt = f"{prompt}, vertical composition 9:16, cinematic lighting, high detail"
    
    params = urllib.parse.urlencode({
        "width": width,
        "height": height,
        "seed": seed,
        "nologo": "true",
        "model": "flux",
    })
    url = f"https://image.pollinations.ai/prompt/{urllib.parse.quote(full_prompt)}?{params}"
    req = urllib.request.Request(url, headers={"User-Agent": "ShortsFlow/1.0"})
    with urllib.request.urlopen(req, timeout=90) as resp:
        return resp.read()


# ── Озвучка: edge-tts ─────────────────────────────────────────
async def _tts(text: str, *, voice: str, out_path: str) -> float:
    """Синтезирует речь, возвращает длительность в секундах."""
    try:
        import edge_tts
    except ImportError:
        raise RuntimeError("Установите edge-tts: pip install edge-tts")

    communicate = edge_tts.Communicate(text, voice, rate="+5%")
    await communicate.save(out_path)

    # Длительность через ffprobe
    raw = subprocess.check_output([
        "ffprobe", "-v", "quiet", "-print_format", "json",
        "-show_format", out_path,
    ])
    return float(json.loads(raw)["format"]["duration"])


# ── Сборка видео: Ken Burns + аудио ───────────────────────────
def _build_with_ffmpeg(scenes: list[dict], *, job: str, workdir: str,
                       tts_voice: str, out_path: str, face_description: str = "") -> str:
    """Собирает ролик из сцен: кадры с Ken Burns + озвучка.
    
    Если передано face_description, использует его для сохранения внешности персонажа.
    """
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    # 1. Параллельно рисуем кадры
    log.info("Рисую %d кадров через Pollinations…", len(scenes))
    with ThreadPoolExecutor(max_workers=3) as pool:
        futures = [
            pool.submit(_pollinations_image, s["visual"], seed=hash(s["visual"]) % 10000 + i,
                       face_description=face_description)
            for i, s in enumerate(scenes)
        ]
        image_bytes = [f.result() for f in futures]

    # 2. Сохраняем картинки
    img_paths = []
    for i, data in enumerate(image_bytes):
        p = f"{workdir}/{job}_img_{i}.jpg"
        with open(p, "wb") as f:
            f.write(data)
        img_paths.append(p)

    # 3. Синтезируем озвучку для каждой сцены
    audio_paths = []
    durations = []
    for i, s in enumerate(scenes):
        ap = f"{workdir}/{job}_voice_{i}.mp3"
        dur = loop.run_until_complete(_tts(s["voice"], voice=tts_voice, out_path=ap))
        audio_paths.append(ap)
        durations.append(max(2.0, min(12.0, dur + 0.5)))  # чуть длиннее голоса

    loop.close()

    # 4. Склеиваем: Ken Burns (медленный зум) + аудио
    # Для каждой сцены: картинка → zoompan → concat
    filter_parts = []
    concat_inputs = []
    for i, (img, dur) in enumerate(zip(img_paths, durations)):
        frames = int(dur * 25)
        # Ken Burns: от 1.0 до 1.15 зума, центрированный
        filter_parts.append(
            f"[{i}:v]scale=1200:2134,zoompan=z='min(zoom+0.0008,1.15)'"
            f":x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
            f":d={frames}:s=1080x1920:fps=25[v{i}]"
        )
        concat_inputs.append(f"[v{i}][{len(img_paths) + i}:a]")

    # Конкатенация видео и аудио
    n = len(scenes)
    filter_parts.append(
        f"{ ''.join(concat_inputs) }concat=n={n}:v=1:a=1[outv][outa]"
    )
    filter_complex = ";".join(filter_parts)

    inputs = []
    for p in img_paths:
        inputs += ["-loop", "1", "-t", str(durations[img_paths.index(p)]), "-i", p]
    for p in audio_paths:
        inputs += ["-i", p]

    cmd = ["ffmpeg", "-y", *inputs,
           "-filter_complex", filter_complex,
           "-map", "[outv]", "-map", "[outa]",
           "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
           "-c:a", "aac", "-b:a", "128k",
           "-movflags", "+faststart",
           out_path]
    log.info("ffmpeg: собираю ролик (%d сцен, %.1f c)…", n, sum(durations))
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return out_path


# ── Главная точка сборки видео ────────────────────────────────
def build_video(script: dict, *, job: str, workdir: str,
                tts_voice: str = "ru-RU-DmitryNeural",
                face_path: str = "", face_description: str = "") -> str:
    """Сценарий → mp4-файл.

    Если передан face_path, использует лицо для сохранения внешности персонажа
    во всех кадрах видео. face_description — текстовое описание лица для промптов.

    Это ЕДИНСТВЕННАЯ точка, куда подключается платный генератор видео
    (Runway/Kling/Veo). Подмените содержимое функции — остальной бот
    не изменится.
    """
    out = f"{workdir}/{job}_final.mp4"
    
    # Если есть лицо, создаём описание для промптов
    if face_path and not face_description:
        face_description = describe_face(face_path)
    
    if face_description:
        log.info("Использую лицо персонажа: %s", face_description)
    
    return _build_with_ffmpeg(script["scenes"], job=job, workdir=workdir,
                              tts_voice=tts_voice, out_path=out,
                              face_description=face_description)
