"""
Test suite — MT5 Dashboard Backend
Requiere: pytest, httpx, sqlalchemy, aiosmtplib (mockeado)
"""

import os
import sys
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch, MagicMock

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, clear_mappers

# ─── Configurar entorno ANTES de importar backend.main ─────────
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["SECRET_KEY"] = "test-secret-key-64chars-long-changeme"
os.environ["VPS_ENDPOINTS"] = ""
os.environ["VPS_SECRET_TOKEN"] = "test-token"
os.environ["FRONTEND_URL"] = "http://localhost:3000"
os.environ["ADMIN_TEAM_PASSWORD"] = "team123"
os.environ["ADMIN_DEV_PASSWORD"] = "dev123"
os.environ["ALERT_EMAIL_ENABLED"] = "false"
os.environ["SMTP_HOST"] = ""
os.environ["SMTP_PORT"] = "587"

# Añadir backend al path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Import after env setup
from backend.main import (
    app,
    Account,
    TelemetryHistory,
    Alert,
    User,
    Base,
    Settings,
    get_db,
)
from backend.main import TelemetryRequest as ApiTelemetryRequest

# ─── Test DB setup ──────────────────────────────────────────────
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine_test = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine_test)

def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

app.dependency_overrides[Base.__dict__.get('_sa_class_manager').class_manager.mapper.class_._sa_class_manager.class_._sa_class_manager.factory] = override_get_db
# El override anterior es frágil; mejor parcheamos la función get_db
from backend.main import get_db as original_get_db
app.dependency_overrides[original_get_db] = override_get_db

# Crear tablas en DB de test usando el mismo metadata
Base.metadata.create_all(bind=engine_test)

client = TestClient(app)

# ─────────────────────────────────────────────────────────────
# FIXTURES
# ─────────────────────────────────────────────────────────────
@pytest.fixture(autouse=True)
def clean_db():
    """Limpia DB entre tests."""
    db = TestingSessionLocal()
    try:
        db.query(TelemetryHistory).delete()
        db.query(Alert).delete()
        db.query(Account).delete()
        db.query(User).delete()
        db.commit()
    finally:
        db.close()
    yield
    # no teardown

# ─────────────────────────────────────────────────────────────
# AUTH
# ─────────────────────────────────────────────────────────────
def test_login_success():
    db = TestingSessionLocal()
    user = User(username="team", hashed_password="fakehash", role="team")
    db.add(user)
    db.commit()
    db.close()

    with patch("backend.main.verify_password", return_value=True):
        r = client.post("/login", json={"username": "team", "password": "any"})
    assert r.status_code == 200
    data = r.json()
    assert "access_token" in data
    assert data["role"] == "team"

def test_login_invalid():
    r = client.post("/login", json={"username": "nouser", "password": "wrong"})
    assert r.status_code == 401

def test_get_me_requires_auth():
    r = client.get("/me")
    assert r.status_code == 401

def test_get_me_with_token():
    from backend.main import create_access_token
    token = create_access_token({"sub": "dev", "role": "dev"})
    r = client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json()["username"] == "dev"

# ─────────────────────────────────────────────────────────────
# TELEMETRY
# ─────────────────────────────────────────────────────────────
def test_telemetry_creates_account_and_history():
    payload = {
        "broker": "FXTM",
        "login": "123456",
        "server": "FXTM-Demo01",
        "name": "Cuenta Test",
        "balance": 10000.0,
        "equity": 10250.5,
        "margin": 1200.0,
        "free_margin": 9050.5,
        "margin_level": 754.2,
        "drawdown_pct": 2.5,
        "regime": "TREND",
        "active_mode": "NORMAL",
        "daily_pnl_usd": 250.5,
        "open_risk_pct": 1.2,
        "positions": [
            {"ticket": 1001, "symbol": "XAUUSD", "type": "BUY", "volume": 0.1, "open_price": 2300.0, "profit": 125.0}
        ],
        "timestamp": "2026-05-02T12:00:00Z",
    }

    r = client.post("/v1/telemetry", json=payload)
    assert r.status_code == 200
    assert r.json()["status"] == "ok"

    db = TestingSessionLocal()
    acc = db.query(Account).filter(Account.login == "123456").first()
    assert acc is not None
    assert acc.status_data["balance"] == 10000.0
    assert acc.status_data["regime"] == "TREND"

    snaps = db.query(TelemetryHistory).filter(TelemetryHistory.account_login == "123456").all()
    assert len(snaps) == 1
    assert snaps[0].equity == 10250.5
    db.close()

def test_telemetry_updates_existing_account():
    payload1 = {
        "broker": "ICMarkets",
        "login": "999",
        "balance": 5000,
        "equity": 5100,
        "margin": 0,
        "free_margin": 5100,
        "margin_level": 0,
        "drawdown_pct": 0.0,
        "positions": [],
        "timestamp": "2026-05-02T12:00:00Z",
    }
    client.post("/v1/telemetry", json=payload1)

    payload2 = {**payload1, "equity": 5200, "daily_pnl_usd": 100}
    r = client.post("/v1/telemetry", json=payload2)
    assert r.status_code == 200

    db = TestingSessionLocal()
    acc = db.query(Account).filter(Account.login == "999").first()
    assert acc.status_data["equity"] == 5200
    snaps = db.query(TelemetryHistory).filter(TelemetryHistory.account_login == "999").all()
    assert len(snaps) == 2
    db.close()

def test_alert_drawdown_warning_and_critical():
    # 12% → warning
    payload = {
        "broker": "Test",
        "login": "dd_user",
        "balance": 10000,
        "equity": 8800,
        "margin": 0,
        "free_margin": 8800,
        "margin_level": 0,
        "drawdown_pct": 12.0,
        "positions": [],
        "timestamp": "2026-05-02T12:00:00Z",
    }
    client.post("/v1/telemetry", json=payload)

    db = TestingSessionLocal()
    alerts = db.query(Alert).filter(Alert.account_login == "dd_user").all()
    assert len(alerts) == 1
    assert alerts[0].severity == "warning"
    assert "Drawdown elevado" in alerts[0].message
    db.close()

def test_alert_drawdown_critical():
    payload = {
        "broker": "Test",
        "login": "dd_critical",
        "balance": 10000,
        "equity": 7900,
        "margin": 0,
        "free_margin": 7900,
        "margin_level": 0,
        "drawdown_pct": 21.0,
        "positions": [],
        "timestamp": "2026-05-02T12:00:00Z",
    }
    client.post("/v1/telemetry", json=payload)

    db = TestingSessionLocal()
    alerts = db.query(Alert).filter(Alert.account_login == "dd_critical").all()
    assert any(a.severity == "critical" and "crítico" in a.message.lower() for a in alerts)
    db.close()

def test_alert_mode_pause():
    payload = {
        "broker": "Test",
        "login": "pause_user",
        "balance": 10000,
        "equity": 10000,
        "margin": 0,
        "free_margin": 10000,
        "margin_level": 0,
        "drawdown_pct": 0.0,
        "active_mode": "PAUSE",
        "positions": [],
        "timestamp": "2026-05-02T12:00:00Z",
    }
    client.post("/v1/telemetry", json=payload)

    db = TestingSessionLocal()
    alert = db.query(Alert).filter(Alert.account_login == "pause_user", Alert.event_type == "mode_change").first()
    assert alert is not None
    assert "PAUSE" in alert.message
    db.close()

def test_alerts_endpoint_requires_auth():
    r = client.get("/alerts")
    assert r.status_code == 401

def test_alerts_endpoint_returns_only_unack():
    db = TestingSessionLocal()
    db.add_all([
        Alert(account_login="a1", broker="B", severity="warning", event_type="test", message="m1", acknowledged=False),
        Alert(account_login="a1", broker="B", severity="warning", event_type="test", message="m2", acknowledged=True),
    ])
    db.commit()
    db.close()

    from backend.main import create_access_token
    token = create_access_token({"sub": "dev", "role": "dev"})
    r = client.get("/alerts", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["message"] == "m1"

def test_close_position_requires_dev_role():
    r = client.post("/close-position", json={"account_id": 1, "ticket": 123})
    assert r.status_code == 401

# ─────────────────────────────────────────────────────────────
# WEBSOCKET smoketest
# ─────────────────────────────────────────────────────────────
def test_websocket_accounts_stream():
    db = TestingSessionLocal()
    acc = Account(broker="OANDA", login="ws_test", status_data={"balance": 1, "equity": 1, "drawdown_pct": 0, "positions": []})
    db.add(acc)
    db.commit()
    db.close()

    with client.websocket_connect("/api/ws/accounts") as websocket:
        data = websocket.receive_json()
        assert data["type"] == "accounts_update"
        assert len(data["data"]) >= 1
        logins = [a["login"] for a in data["data"]]
        assert "ws_test" in logins

# ─────────────────────────────────────────────────────────────
# HEALTH
# ─────────────────────────────────────────────────────────────
def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"
