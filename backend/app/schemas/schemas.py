from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

class LoginRequest(BaseModel):
    username: str
    password: str

class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    username: str

class AccountTelemetry(BaseModel):
    account_id: int
    broker: str
    name: Optional[str] = None
    account_type: Optional[str] = None
    asset: Optional[str] = None
    bot_name: Optional[str] = None
    timeframe: Optional[str] = None
    initial_balance: Optional[float] = None
    balance: float
    equity: float
    margin: float = 0.0
    free_margin: float = 0.0
    margin_level: float = 0.0
    drawdown_pct: float = 0.0
    regime: Optional[str] = "UNKNOWN"
    active_mode: Optional[str] = "NORMAL"
    daily_pnl_usd: Optional[float] = 0.0
    open_risk_pct: Optional[float] = 0.0
    win_rate: Optional[float] = None
    profit_factor: Optional[float] = None
    max_drawdown_pct: Optional[float] = None
    kelly_fraction: Optional[float] = None
    n_trades_cycle: Optional[int] = None
    last_audit: Optional[str] = ""
    closed_trades: Optional[List[Dict[str, Any]]] = Field(default_factory=list)
    positions: List[Dict[str, Any]] = Field(default_factory=list)

class VpsTelemetryPayload(BaseModel):
    """
    Payload de telemetria con patron UTC 3-timestamp (broker-agnostic).

    timestamp_utc          : reloj del SO del VPS (TimeGMT()) en UTC. Canonico.
    broker_time            : hora del servidor MT5 broker (TimeTradeServer()). Naive ISO.
    broker_offset_seconds  : timestamp_utc - broker_time. Espera valor estable por broker
                             (ej. UTC+2 -> -7200, UTC+3 -> -10800). Si el offset diverge
                             >60s del valor esperado: alerta NTP-skew (VPS reloj desfasado).
    """
    vps_id: str
    timestamp_utc: datetime
    broker_time: Optional[datetime] = None
    broker_offset_seconds: Optional[int] = None
    accounts: List[AccountTelemetry]

class AccountStatus(BaseModel):
    id: int
    broker: str
    login: str
    server: Optional[str]
    name: Optional[str]
    last_update: Optional[datetime]
    status_data: Optional[Dict[str, Any]]
    is_active: bool

    class Config:
        from_attributes = True

class EquityPoint(BaseModel):
    timestamp_utc: datetime
    balance: float
    equity: float
    drawdown_pct: float
    daily_pnl_usd: Optional[float]
    regime: Optional[str]
    active_mode: Optional[str]

class PerformanceSummary(BaseModel):
    account_login: str
    broker: str
    equity_curve: List[EquityPoint]
    total_pnl_usd: float
    max_drawdown_pct: float
    win_rate: Optional[float]
    profit_factor: Optional[float]
    n_snapshots: int

class AlertResponse(BaseModel):
    id: int
    account_login: str
    broker: str
    severity: str
    event_type: str
    message: str
    payload: Optional[Dict[str, Any]]
    timestamp_utc: datetime
    acknowledged: bool

    class Config:
        from_attributes = True

class ClosePositionRequest(BaseModel):
    account_id: int
    ticket: int
