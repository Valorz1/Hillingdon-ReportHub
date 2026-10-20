import secrets
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..classifier import classify
from ..database import get_db
from ..deps import current_user, require_admin
from ..llm import llm_classify
from ..models import AuditLog, Report, User, utcnow
from ..schemas import ReassignRequest, ReportCreate, StatusUpdate

router = APIRouter(prefix="/api/reports", tags=["reports"])

# No 0/O/1/I so refs are easy to read out over the phone
_REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def _new_ref(db: Session) -> str:
    stamp = utcnow().strftime("%d-%m")
    while True:
        code = "".join(secrets.choice(_REF_ALPHABET) for _ in range(5))
        ref = f"HIL-{stamp}-{code}"
        if not db.query(Report.id).filter(Report.ref == ref).first():
            return ref


def _log(r: Report, action: str, details: Optional[str] = None, actor: Optional[str] = None):
    r.audit_log.append(AuditLog(action=action, details=details, actor=actor, ts=utcnow()))


def _iso(dt: datetime) -> str:
    # SQLite (and pre-existing Postgres columns) hand back naive datetimes; they're UTC
    return (dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)).isoformat()


def _out(r: Report, include_photo: bool = False) -> dict:
    return {
        "id": r.id,
        "ref": r.ref,
        "subject": r.subject,
        "description": r.description,
        "location": r.location,
        "lat": r.lat,
        "lng": r.lng,
        "hasPhoto": r.photo is not None,
        "photo": r.photo if include_photo else None,
        "reporter": r.reporter,
        "status": r.status,
        "classification": {
            "department": r.department,
            "confidence": r.confidence,
            "reasoning": r.reasoning,
            "engine": "rules",
        },
        "submittedAt": _iso(r.submitted_at),
        "reassignedFrom": r.reassigned_from,
        "auditLog": [
            {"ts": _iso(l.ts), "action": l.action, "details": l.details, "actor": l.actor}
            for l in r.audit_log
        ],
    }


def _get_or_404(db: Session, report_id: str) -> Report:
    r = db.get(Report, report_id)
    if not r:
        raise HTTPException(status_code=404, detail="Report not found")
    return r


@router.post("")
async def create_report(req: ReportCreate, me: User = Depends(current_user), db: Session = Depends(get_db)):
    c = classify(req.subject, req.description)
    if c["confidence"] < 0.5:
        llm_result = await llm_classify(req.subject, req.description)
        if llm_result:
            c = llm_result
    r = Report(
        id=str(uuid.uuid4()),
        ref=_new_ref(db),
        subject=req.subject.strip(),
        description=req.description.strip(),
        location=req.location,
        lat=req.lat,
        lng=req.lng,
        photo=req.photo,
        # residents can only file under their own name; staff may log on someone's behalf
        reporter=(req.reporter or me.email) if me.role == "admin" else me.email,
        status="new",
        department=c["department"],
        confidence=c["confidence"],
        reasoning=c["reasoning"],
        submitted_at=utcnow(),
    )
    _log(r, "submitted", actor=me.email)
    _log(r, "classified", details=f"{c['engine']} → {c['department']} ({c['confidence']})", actor="system")
    db.add(r)
    db.commit()
    return _out(r, include_photo=True)


@router.get("")
def list_reports(
    reporter: Optional[str] = None,
    dept: Optional[str] = None,
    me: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    # Photos are left out of the list (they'd make every 5s poll several MB);
    # the dashboard fetches them per report via GET /{id}.
    q = db.query(Report)
    if me.role != "admin":
        q = q.filter(Report.reporter == me.email)
    elif reporter:
        q = q.filter(Report.reporter == reporter)
    if dept:
        q = q.filter(Report.department == dept)
    return [_out(r) for r in q.order_by(Report.submitted_at.desc()).all()]


@router.get("/{report_id}")
def get_report(report_id: str, me: User = Depends(current_user), db: Session = Depends(get_db)):
    r = _get_or_404(db, report_id)
    if me.role != "admin" and r.reporter != me.email:
        raise HTTPException(status_code=403, detail="Forbidden")
    return _out(r, include_photo=True)


@router.patch("/{report_id}/status")
def update_status(
    report_id: str,
    req: StatusUpdate,
    me: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    r = _get_or_404(db, report_id)
    if r.status != req.status:
        _log(r, "status_changed", details=f"{r.status} → {req.status}", actor=me.email)
        r.status = req.status
        db.commit()
    return _out(r)


@router.put("/{report_id}/reassign")
def reassign_report(
    report_id: str,
    req: ReassignRequest,
    me: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    r = _get_or_404(db, report_id)
    if r.department != req.department:
        _log(r, "reassigned", details=f"{r.department} → {req.department} ({req.reason})", actor=me.email)
        r.reassigned_from = r.department
        r.department = req.department
        db.commit()
    return _out(r)
