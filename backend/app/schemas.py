from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

from .classifier import DEPARTMENTS

Status = Literal["new", "in-progress", "resolved", "closed"]

# ~1024px JPEG at q0.75 is well under this; anything bigger is not from our client
MAX_PHOTO_CHARS = 3_000_000


class LoginRequest(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    accountId: str
    email: str
    name: str
    address: str
    role: str


class LoginResponse(BaseModel):
    token: str
    user: UserOut


class ReportCreate(BaseModel):
    subject: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=5000)
    location: Optional[str] = Field(None, max_length=500)
    lat: Optional[float] = Field(None, ge=-90, le=90)
    lng: Optional[float] = Field(None, ge=-180, le=180)
    photo: Optional[str] = Field(None, max_length=MAX_PHOTO_CHARS)
    reporter: Optional[str] = None

    @field_validator("photo")
    @classmethod
    def photo_is_image(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not v.startswith("data:image/"):
            raise ValueError("photo must be an image data URL")
        return v


class StatusUpdate(BaseModel):
    status: Status


class ReassignRequest(BaseModel):
    department: str
    reason: str = Field("Manual reassignment", max_length=300)

    @field_validator("department")
    @classmethod
    def known_department(cls, v: str) -> str:
        if v not in DEPARTMENTS:
            raise ValueError(f"unknown department '{v}'")
        return v
