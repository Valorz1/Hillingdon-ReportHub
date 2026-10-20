from typing import Optional

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from .auth import decode_token
from .database import get_db
from .models import User


def current_user(authorization: Optional[str] = Header(None), db: Session = Depends(get_db)) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        user_id = decode_token(authorization.split(" ", 1)[1])
    except Exception:
        raise HTTPException(status_code=401, detail="Session expired — please sign in again")
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def require_admin(me: User = Depends(current_user)) -> User:
    if me.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return me
