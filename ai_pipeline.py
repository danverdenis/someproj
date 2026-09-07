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
from concurrent.futures import ThreadPoolExecutor

log = logging.getLogger("shortsflow.ai")


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
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

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
    with urllib.request.urlopen(req, timeout=60) as resp:
        payload = json.loads(resp.read().decode("utf-8"))

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
def _pollinations_image(prompt: str, *, seed: int = 0, width: int = 720, height: int = 1280) -> bytes:
    """Рисует кадр 9:16 через Pollinations. Возвращает JPEG-байты."""
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
                       tts_voice: str, out_path: str) -> str:
    """Собирает ролик из сцен: кадры с Ken Burns + озвучка."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    # 1. Параллельно рисуем кадры
    log.info("Рисую %d кадров через Pollinations…", len(scenes))
    with ThreadPoolExecutor(max_workers=3) as pool:
        futures = [
            pool.submit(_pollinations_image, s["visual"], seed=hash(s["visual"]) % 10000 + i)
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
                tts_voice: str = "ru-RU-DmitryNeural") -> str:
    """Сценарий → mp4-файл.

    Это ЕДИНСТВЕННАЯ точка, куда подключается платный генератор видео
    (Runway/Kling/Veo). Подмените содержимое функции — остальной бот
    не изменится.
    """
    out = f"{workdir}/{job}_final.mp4"
    return _build_with_ffmpeg(script["scenes"], job=job, workdir=workdir,
                              tts_voice=tts_voice, out_path=out)
