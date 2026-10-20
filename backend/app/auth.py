import logging
import os
from datetime import datetime, timedelta, timezone

import bcrypt as _bcrypt
from jose import jwt

_DEV_SECRET = "dev-secret-key-change-in-prod"
SECRET_KEY = os.getenv("SECRET_KEY") or _DEV_SECRET
ALGORITHM  = "HS256"
TOKEN_EXPIRE_DAYS = 30

if SECRET_KEY == _DEV_SECRET:
    logging.getLogger("uvicorn.error").warning("SECRET_KEY not set — using the insecure dev key")


def hash_password(password: str) -> str:
    return _bcrypt.hashpw(password.encode(), _bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return _bcrypt.checkpw(plain.encode(), hashed.encode())


def create_token(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=TOKEN_EXPIRE_DAYS)
    return jwt.encode({"sub": user_id, "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> str:
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    sub = payload.get("sub")
    if sub is None:
        raise ValueError("invalid token")
    return sub
