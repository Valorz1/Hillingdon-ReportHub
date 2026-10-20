import os

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

from ..deps import current_user
from ..llm import llm_analyse_image, llm_clean_transcript
from ..models import User
from ..schemas import MAX_PHOTO_CHARS

router = APIRouter(prefix="/api", tags=["transcribe"])

DEEPGRAM_KEY = os.getenv("DEEPGRAM_KEY", "")
DEEPGRAM_URL = (
    "https://api.deepgram.com/v1/listen"
    "?model=nova-2&language=en-GB&punctuate=true&smart_format=true"
)
MAX_AUDIO_BYTES = 10 * 1024 * 1024  # ~10 min of opus; keep in step with nginx client_max_body_size


@router.post("/transcribe")
async def transcribe(
    audio: UploadFile = File(...),
    _me: User = Depends(current_user),
):
    if not DEEPGRAM_KEY:
        raise HTTPException(status_code=503, detail="Voice notes aren't set up on this server yet — please type instead.")

    data = await audio.read(MAX_AUDIO_BYTES + 1)
    if len(data) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Voice note too long — keep it under a few minutes.")
    if not data:
        raise HTTPException(status_code=400, detail="Empty recording")
    content_type = audio.content_type or "audio/webm"

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                DEEPGRAM_URL,
                headers={"Authorization": f"Token {DEEPGRAM_KEY}", "Content-Type": content_type},
                content=data,
            )
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="Transcription service unreachable")

    if not resp.is_success:
        raise HTTPException(status_code=502, detail=f"Deepgram error: {resp.status_code}")

    raw = (
        resp.json()
        .get("results", {})
        .get("channels", [{}])[0]
        .get("alternatives", [{}])[0]
        .get("transcript", "")
        .strip()
    )

    text = await llm_clean_transcript(raw)
    return {"text": text, "raw": raw}


class ImageRequest(BaseModel):
    dataUrl: str = Field(max_length=MAX_PHOTO_CHARS)   # full data: URL from the frontend FileReader


@router.post("/analyse-image")
async def analyse_image(
    req: ImageRequest,
    _me: User = Depends(current_user),
):
    result = await llm_analyse_image(req.dataUrl)
    if result is None:
        raise HTTPException(status_code=503, detail="Image analysis not available — set NIM_KEY")
    return result
