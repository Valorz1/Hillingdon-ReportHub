import os
from pathlib import Path

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./data/reports.db")

connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}
    # sqlite won't create the parent folder itself
    db_path = DATABASE_URL.split("///", 1)[-1]
    if db_path and db_path != ":memory:":
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)

engine = create_engine(DATABASE_URL, connect_args=connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def init_db():
    """Create tables, then add any columns introduced after the first deploy.

    There's no migration tool in this project, and create_all() never alters
    an existing table, so new nullable columns are patched in here.
    """
    from . import models  # noqa: F401 — registers tables on Base

    Base.metadata.create_all(bind=engine)

    existing = {c["name"] for c in inspect(engine).get_columns("reports")}
    added = {"lat": "FLOAT", "lng": "FLOAT", "photo": "TEXT"}
    with engine.begin() as conn:
        for col, sql_type in added.items():
            if col not in existing:
                conn.execute(text(f"ALTER TABLE reports ADD COLUMN {col} {sql_type}"))


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
