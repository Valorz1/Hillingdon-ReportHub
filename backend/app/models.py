from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from .database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id              = Column(String, primary_key=True)
    account_id      = Column(String, unique=True)
    email           = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    name            = Column(String)
    address         = Column(String)
    role            = Column(String, default="resident")


class Report(Base):
    __tablename__ = "reports"

    id              = Column(String, primary_key=True)
    ref             = Column(String, unique=True)
    subject         = Column(String)
    description     = Column(Text)
    location        = Column(String, nullable=True)
    lat             = Column(Float, nullable=True)
    lng             = Column(Float, nullable=True)
    photo           = Column(Text, nullable=True)  # resized JPEG data URL
    reporter        = Column(String, nullable=True, index=True)
    status          = Column(String, default="new", index=True)
    department      = Column(String, index=True)
    confidence      = Column(Float)
    reasoning       = Column(String)
    submitted_at    = Column(DateTime(timezone=True), default=utcnow, index=True)
    reassigned_from = Column(String, nullable=True)

    # selectin = one extra query for the whole list instead of one per report
    audit_log = relationship(
        "AuditLog", order_by="AuditLog.ts", lazy="selectin", cascade="all, delete-orphan",
    )


class AuditLog(Base):
    __tablename__ = "audit_log"

    id        = Column(Integer, primary_key=True, autoincrement=True)
    report_id = Column(String, ForeignKey("reports.id"), index=True)
    ts        = Column(DateTime(timezone=True), default=utcnow)
    action    = Column(String)
    details   = Column(String, nullable=True)
    actor     = Column(String, nullable=True)
