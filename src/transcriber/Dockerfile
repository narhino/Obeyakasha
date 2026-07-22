FROM python:3.12-slim

WORKDIR /app

# ffmpeg is needed once real transcription is enabled (M3).
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Bake the Whisper model INTO the image at build time so it is never downloaded
# at runtime. Without this the model lands in the container's ephemeral
# filesystem and is wiped on every restart/rebuild — the next transcribe then
# re-downloads it (and can be rate-limited by Hugging Face), which shows up as
# transcriptions that fail fast or never start. Baked in, the model is always
# present, survives every deploy, and the first transcribe is instant. Docker
# caches this layer, so it only actually downloads when the model changes.
ARG WHISPER_MODEL=base
ENV WHISPER_MODEL=${WHISPER_MODEL}
RUN python -c "import os; from faster_whisper import WhisperModel; WhisperModel(os.environ['WHISPER_MODEL'], device='cpu', compute_type='int8')"

COPY main.py .

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
