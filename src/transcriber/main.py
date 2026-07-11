"""
Transcriber sidecar (PLAN §8.1 / §10 in PLAN.md, F12).

faster-whisper behind FastAPI. Audio NEVER leaves the VPS — the worker POSTs a
local path or a signed short-lived URL and gets back segments + full text.

M0: skeleton with a stub /transcribe so the service boots and the contract is
fixed. The real faster-whisper model load is enabled in M3 (set STUB=0 and
install the model). This keeps the container image buildable now without
pulling multi-GB weights into early milestones.
"""
import os
from typing import Optional

from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="akasha-transcriber")

STUB = os.environ.get("TRANSCRIBER_STUB", "1") == "1"
MODEL_SIZE = os.environ.get("WHISPER_MODEL", "medium")

_model = None


def get_model():
    global _model
    if _model is None:
        # Imported lazily so the stub path needs no heavy deps.
        from faster_whisper import WhisperModel  # type: ignore

        _model = WhisperModel(MODEL_SIZE, device="cpu", compute_type="int8")
    return _model


class TranscribeRequest(BaseModel):
    path: Optional[str] = None
    url: Optional[str] = None
    language: Optional[str] = None


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
def transcribe(req: TranscribeRequest):
    source = req.path or req.url
    if STUB or not source:
        return TranscribeResponse(
            language=req.language or "en",
            segments=[Segment(start=0.0, end=0.0, text="")],
            full_text="",
        )

    model = get_model()
    segments_iter, info = model.transcribe(source, language=req.language)
    segments = [
        Segment(start=s.start, end=s.end, text=s.text.strip())
        for s in segments_iter
    ]
    full_text = " ".join(s.text for s in segments).strip()
    return TranscribeResponse(
        language=info.language, segments=segments, full_text=full_text
    )
