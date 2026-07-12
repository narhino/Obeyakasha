"""
Transcriber sidecar (PLAN §8.1, F12) — self-hosted, FREE.

faster-whisper behind FastAPI. Audio bytes are POSTed by the app (multipart),
transcribed locally, and returned as segments + full text. Audio never leaves
the server. Model size is configurable (WHISPER_MODEL, default "base" — light
enough for a small VPS; bump to "small"/"medium" for more accuracy).

Set TRANSCRIBER_STUB=0 to enable the real model (default). STUB=1 returns an
empty transcript (useful before the model weights are downloaded).
"""
import os
import tempfile

from fastapi import FastAPI, UploadFile, File, Form
from pydantic import BaseModel

app = FastAPI(title="akasha-transcriber")

STUB = os.environ.get("TRANSCRIBER_STUB", "0") == "1"
MODEL_SIZE = os.environ.get("WHISPER_MODEL", "base")

_model = None


def get_model():
    global _model
    if _model is None:
        from faster_whisper import WhisperModel  # type: ignore

        _model = WhisperModel(MODEL_SIZE, device="cpu", compute_type="int8")
    return _model


class Segment(BaseModel):
    start: float
    end: float
    text: str


class TranscribeResponse(BaseModel):
    language: str
    segments: list[Segment]
    full_text: str


@app.get("/health")
def health():
    return {"ok": True, "stub": STUB, "model": MODEL_SIZE}


@app.post("/transcribe", response_model=TranscribeResponse)
async def transcribe(
    file: UploadFile = File(...),
    language: str | None = Form(default=None),
):
    if STUB:
        return TranscribeResponse(language=language or "en", segments=[], full_text="")

    # Persist to a temp file (faster-whisper reads a path).
    suffix = os.path.splitext(file.filename or "audio")[1] or ".m4a"
    with tempfile.NamedTemporaryFile(delete=True, suffix=suffix) as tmp:
        tmp.write(await file.read())
        tmp.flush()
        model = get_model()
        segments_iter, info = model.transcribe(
            tmp.name, language=language, vad_filter=True
        )
        segments = [
            Segment(start=round(s.start, 2), end=round(s.end, 2), text=s.text.strip())
            for s in segments_iter
        ]
    full_text = " ".join(s.text for s in segments).strip()
    return TranscribeResponse(
        language=info.language, segments=segments, full_text=full_text
    )
