from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, JSON, Text, func, UniqueConstraint

from app.db.session import Base

class Account(Base):
    __tablename__ = "accounts"
    id = Column(Integer, primary_key=True, index=True)
    broker = Column(String, nullable=False)
    login = Column(String, nullable=False, index=True)
    server = Column(String, nullable=True)
    name = Column(String, nullable=True)
    last_update = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    status_data = Column(JSON, nullable=True)
    is_active = Column(Boolean, default=True)
    
    __table_args__ = (
        UniqueConstraint("broker", "login", name="ux_broker_login"),
    )



class TelemetryHistory(Base):
    __tablename__ = "telemetry_history"
    id = Column(Integer, primary_key=True, index=True)
    account_login = Column(String, index=True)
    broker = Column(String)
    timestamp_utc = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    balance = Column(Float)
    equity = Column(Float)
    drawdown_pct = Column(Float)
    daily_pnl_usd = Column(Float, nullable=True)
    open_risk_pct = Column(Float, nullable=True)
    regime = Column(String, nullable=True)
    active_mode = Column(String, nullable=True)
    n_positions = Column(Integer, default=0)
    # Audit Integrity
    prev_hash = Column(String, nullable=True)
    record_hash = Column(String, index=True)

class ClosedTrade(Base):
    __tablename__ = "closed_trades"
    id = Column(Integer, primary_key=True, index=True)
    account_login = Column(String, index=True)
    ticket = Column(Integer, unique=True, index=True)
    symbol = Column(String, index=True)
    trade_type = Column(String)  # BUY, SELL
    close_time_utc = Column(DateTime(timezone=True), index=True)
    profit_net = Column(Float)

class TradeCommand(Base):
    __tablename__ = "trade_commands"
    id = Column(Integer, primary_key=True, index=True)
    account_login = Column(String, index=True, nullable=False)
    action = Column(String, nullable=False)  # close_position
    ticket = Column(Integer, index=True, nullable=False)
    status = Column(String, default="pending", index=True)  # pending, executed, failed
    result_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

class Alert(Base):
    __tablename__ = "alerts"
    id = Column(Integer, primary_key=True, index=True)
    account_login = Column(String, index=True)
    broker = Column(String)
    severity = Column(String)
    event_type = Column(String)
    message = Column(Text)
    payload = Column(JSON, nullable=True)
    timestamp_utc = Column(DateTime(timezone=True), server_default=func.now())
    acknowledged = Column(Boolean, default=False)

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    role = Column(String)
    is_active = Column(Boolean, default=True)

class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=True)
    username = Column(String, nullable=True)
    action = Column(String, nullable=False) # e.g., "CLOSE_TRADE", "LOGIN_SUCCESS", "PASSWORD_CHANGE"
    resource = Column(String, nullable=True) # e.g., "Account #123"
    ip_address = Column(String, nullable=True)
    timestamp_utc = Column(DateTime(timezone=True), server_default=func.now())
    details = Column(JSON, nullable=True)

