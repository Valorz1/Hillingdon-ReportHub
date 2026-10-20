from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ..deps import current_user
from ..models import User

router = APIRouter(prefix="/api", tags=["chat"])


class ChatMessage(BaseModel):
    role: str     # "user" | "assistant"
    content: str = Field(max_length=5000)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(max_length=100)


_FALLBACKS = [
    "Got it — anything else to add before you submit?",
    "Thanks for the details. You can add a photo or voice note too if that helps.",
    "Understood. Hit Submit when you're ready and we'll route it to the right team.",
    "The more detail you can give — exact location, how long it's been there — the better.",
    "Noted. Do you know roughly when this started?",
    "Got it. Is there anything that makes it a safety risk we should flag?",
    "Thanks. Adding your location (via the pin icon) will help the team find it quickly.",
    "Understood. Has anyone else in the area reported the same issue, do you know?",
    "Received. Is the problem getting worse, or has it been the same for a while?",
    "Got it. A photo would really help — tap the camera icon if you want to add one.",
    "Thanks for reporting this. Anything else you think the team should know?",
    "Noted. Is there a specific time of day when it's most noticeable?",
    "Got it. Once you hit Submit, you'll get a reference number to track the report.",
    "Thanks. Does this affect vehicle access, pedestrians, or both?",
    "Understood — we'll make sure this gets to the right people.",
]


@router.post("/chat")
async def chat(req: ChatRequest, _me: User = Depends(current_user)):
    reply = _FALLBACKS[len(req.messages) % len(_FALLBACKS)]
    return {"reply": reply}
