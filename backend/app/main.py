import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from .database import init_db
from .routers import auth, chat, reports, transcribe

init_db()

app = FastAPI(title="Hillingdon ReportHub API", docs_url="/api/docs", redoc_url=None)

# Auth is a Bearer header, not cookies, so credentials stay off — which is
# also what makes a wildcard origin valid. Lock it down with CORS_ORIGINS.
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1024)

app.include_router(auth.router)
app.include_router(reports.router)
app.include_router(transcribe.router)
app.include_router(chat.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
