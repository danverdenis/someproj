# Базовый образ Python 3.11 (slim — лёгкий)
FROM python:3.11-slim

# Метаданные
LABEL maintainer="ShortsFlow Bot"
LABEL description="Telegram-бот для автопубликации YouTube Shorts"
LABEL version="1.0"

# Устанавливаем ffmpeg и системные зависимости для OpenCV/MediaPipe
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    && rm -rf /var/lib/apt/lists/*

# Создаём рабочую директорию
WORKDIR /app

# Копируем только requirements.txt для кеширования зависимостей
COPY requirements.txt .

# Устанавливаем Python-зависимости
RUN pip install --no-cache-dir -r requirements.txt

# Копируем код приложения
COPY main.py ai_pipeline.py ./

# Создаём директорию для временных файлов
RUN mkdir -p tmp

# Указываем, что том для временных файлов
VOLUME ["/app/tmp"]

# Переменные окружения по умолчанию
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# Команда запуска
CMD ["python", "main.py"]
