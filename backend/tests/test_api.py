import os
import sys
import tempfile
from pathlib import Path

# Point the app at a throwaway SQLite file before anything imports it
_tmp = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = f"sqlite:///{Path(_tmp) / 'test.db'}"
os.environ["SEED_DEMO_REPORTS"] = "1"
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import seed  # noqa: E402,F401 — creates tables + demo users/reports
from fastapi.testclient import TestClient  # noqa: E402

from app.classifier import classify  # noqa: E402
from app.main import app  # noqa: E402

client = TestClient(app)


def _login(email, password):
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


ADMIN = _login("admin@hillingdon.gov.uk", "admin")
RESIDENT = _login("fakeemail@gmail.com", "password")
PHOTO = "data:image/jpeg;base64,/9j/4AAQSkZJRg=="


# ── classifier ────────────────────────────────────────────────────

def test_classifier_routes_brief_examples():
    assert classify("Pothole", "Huge pothole on the road")["department"] == "streets"
    assert classify("Fly-tipping", "Mattresses fly-tipped in the alley")["department"] == "streets"


def test_classifier_matches_whole_words_only():
    # "parent" must not count as "rent", "cabinet" not as "bin", "care" not as "car"
    c = classify("Help", "My parent has a broken cabinet and needs care")
    assert c["department"] != "housing"
    assert "'bin'" not in c["reasoning"]


def test_classifier_accepts_plurals():
    assert classify("", "the bins were not collected")["department"] == "streets"


# ── auth ──────────────────────────────────────────────────────────

def test_bad_login_and_bad_token():
    assert client.post("/api/auth/login", json={"email": "x@y.z", "password": "no"}).status_code == 401
    assert client.get("/api/reports", headers={"Authorization": "Bearer junk"}).status_code == 401
    assert client.get("/api/reports").status_code == 401


def test_me():
    assert client.get("/api/auth/me", headers=RESIDENT).json()["role"] == "resident"


# ── reports ───────────────────────────────────────────────────────

def test_create_report_with_photo_and_coords():
    r = client.post("/api/reports", headers=RESIDENT, json={
        "subject": "Pothole outside school",
        "description": "Deep pothole outside the school gates",
        "location": "Long Lane, Ickenham",
        "lat": 51.56, "lng": -0.44,
        "photo": PHOTO,
        "reporter": "someone-else@example.com",  # residents can't spoof this
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["classification"]["department"] == "streets"
    assert body["ref"].startswith("HIL-")
    assert body["reporter"] == "fakeemail@gmail.com"
    assert body["hasPhoto"] and body["photo"] == PHOTO
    assert [e["action"] for e in body["auditLog"]] == ["submitted", "classified"]

    # list omits the photo payload, detail includes it
    listed = next(x for x in client.get("/api/reports", headers=ADMIN).json() if x["id"] == body["id"])
    assert listed["hasPhoto"] and listed["photo"] is None
    assert client.get(f"/api/reports/{body['id']}", headers=ADMIN).json()["photo"] == PHOTO


def test_rejects_bad_input():
    bad = [
        {"subject": "", "description": "x"},
        {"subject": "x", "description": "x", "photo": "javascript:alert(1)"},
        {"subject": "x", "description": "x", "lat": 200},
    ]
    for payload in bad:
        assert client.post("/api/reports", headers=RESIDENT, json=payload).status_code == 422


def test_residents_only_see_their_own_reports():
    mine = client.get("/api/reports", headers=RESIDENT).json()
    assert mine and all(r["reporter"] == "fakeemail@gmail.com" for r in mine)


def test_status_and_reassign_flow():
    rid = client.get("/api/reports", headers=ADMIN).json()[0]["id"]

    assert client.patch(f"/api/reports/{rid}/status", headers=RESIDENT, json={"status": "resolved"}).status_code == 403
    assert client.patch(f"/api/reports/{rid}/status", headers=ADMIN, json={"status": "bogus"}).status_code == 422

    r = client.patch(f"/api/reports/{rid}/status", headers=ADMIN, json={"status": "in-progress"})
    assert r.status_code == 200 and r.json()["status"] == "in-progress"

    assert client.put(f"/api/reports/{rid}/reassign", headers=ADMIN, json={"department": "nope"}).status_code == 422
    r = client.put(f"/api/reports/{rid}/reassign", headers=ADMIN, json={"department": "planning"})
    body = r.json()
    assert body["classification"]["department"] == "planning"
    assert body["auditLog"][-1]["action"] == "reassigned"


def test_demo_reports_seeded():
    assert len(client.get("/api/reports", headers=ADMIN).json()) >= 28
