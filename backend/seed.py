import json
import os
import sys
import uuid
from datetime import timedelta
from pathlib import Path

sys.path.insert(0, os.path.dirname(__file__))

from app.auth import hash_password
from app.classifier import classify
from app.database import SessionLocal, init_db
from app.models import AuditLog, Report, User, utcnow

init_db()

USERS = [
    {
        "id": "user-admin-001",
        "account_id": "LBH-2847-9135",
        "email": "admin@hillingdon.gov.uk",
        "password": "admin",
        "name": "Sarah Chen",
        "address": "Civic Centre, High Street, Uxbridge, UB8 1UW",
        "role": "admin",
    },
    {
        "id": "user-resident-001",
        "account_id": "LBH-5512-0374",
        "email": "fakeemail@gmail.com",
        "password": "password",
        "name": "James Patel",
        "address": "47 Maple Drive, Ickenham, Uxbridge, UB10 8NR",
        "role": "resident",
    },
]

db = SessionLocal()
for u in USERS:
    if not db.query(User).filter(User.email == u["email"]).first():
        db.add(User(
            id=u["id"],
            account_id=u["account_id"],
            email=u["email"],
            hashed_password=hash_password(u["password"]),
            name=u["name"],
            address=u["address"],
            role=u["role"],
        ))
        print(f"  seeded {u['email']}")
    else:
        print(f"  skipped {u['email']} (exists)")
db.commit()

# Demo reports — opt-in, and only into an empty table, so a real deployment
# never gets fake data mixed in.
if os.getenv("SEED_DEMO_REPORTS", "").lower() in ("1", "true", "yes"):
    if db.query(Report.id).first():
        print("  skipped demo reports (reports table not empty)")
    else:
        demo = json.loads((Path(__file__).parent / "demo_reports.json").read_text(encoding="utf-8"))
        now = utcnow()
        for i, d in enumerate(demo):
            ts = now - timedelta(minutes=37 * (len(demo) - i))
            c = classify(d["subject"], d["description"])
            rid = str(uuid.uuid4())
            r = Report(
                id=rid,
                ref=f"HIL-{ts:%d-%m}-{rid[:5].upper()}",
                subject=d["subject"],
                description=d["description"],
                location=d.get("location"),
                lat=d.get("lat"),
                lng=d.get("lng"),
                reporter=d.get("reporter"),
                status=d.get("status", "new"),
                department=c["department"],
                confidence=c["confidence"],
                reasoning=c["reasoning"],
                submitted_at=ts,
            )
            r.audit_log.append(AuditLog(ts=ts, action="submitted", actor=r.reporter))
            r.audit_log.append(AuditLog(
                ts=ts, action="classified", actor="system",
                details=f"rules → {c['department']} ({c['confidence']})",
            ))
            if r.status != "new":
                r.audit_log.append(AuditLog(
                    ts=ts + timedelta(minutes=25), action="status_changed",
                    actor="admin@hillingdon.gov.uk", details=f"new → {r.status}",
                ))
            db.add(r)
        db.commit()
        print(f"  seeded {len(demo)} demo reports")

db.close()
print("Done.")
