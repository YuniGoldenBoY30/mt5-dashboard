from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import httpx
from app.core.security import get_current_user, require_dev
from app.db.session import get_db
from app.models.models import Account, TelemetryHistory, Alert, User
from app.schemas.schemas import AccountStatus, PerformanceSummary, EquityPoint, AlertResponse, ClosePositionRequest
from app.services.audit import AuditService


router = APIRouter()

@router.get("/accounts", response_model=List[AccountStatus])
async def get_accounts(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return db.query(Account).filter(Account.is_active == True).all()

@router.get("/performance/{login}", response_model=PerformanceSummary)
async def get_performance(
    login: str, limit: int = 1000, sampling_minutes: Optional[int] = None,
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    query = db.query(TelemetryHistory).filter(TelemetryHistory.account_login == login)
    rows = query.order_by(TelemetryHistory.timestamp_utc.desc()).limit(limit).all()
    rows = list(reversed(rows))

    if sampling_minutes and len(rows) > 50:
        sampled = [rows[0]]
        last_ts = rows[0].timestamp_utc
        for r in rows[1:]:
            if (r.timestamp_utc - last_ts).total_seconds() >= (sampling_minutes * 60):
                sampled.append(r)
                last_ts = r.timestamp_utc
        if rows[-1] not in sampled:
            sampled.append(rows[-1])
        rows = sampled

    # Normalización de curva:
    # - balance: parte del balance inicial y se desplaza por cambios de balance (cierres)
    # - equity: balance_global + flotante_actual
    normalized_points = []
    if rows:
        baseline_balance = rows[0].balance
        prev_raw_balance = rows[0].balance

        for r in rows:
            balance_delta = r.balance - prev_raw_balance
            baseline_balance += balance_delta
            floating_pnl = r.equity - r.balance
            equity_display = baseline_balance + floating_pnl

            normalized_points.append(
                EquityPoint(
                    timestamp_utc=r.timestamp_utc,
                    balance=baseline_balance,
                    equity=equity_display,
                    drawdown_pct=r.drawdown_pct,
                    daily_pnl_usd=r.daily_pnl_usd,
                    regime=r.regime,
                    active_mode=r.active_mode,
                )
            )
            prev_raw_balance = r.balance

    equity_curve = normalized_points
    
    total_pnl = (equity_curve[-1].equity - equity_curve[0].equity) if len(equity_curve) >= 2 else 0.0
    max_dd = max((r.drawdown_pct for r in rows), default=0.0)
    
    account = db.query(Account).filter(Account.login == login).first()
    wr = account.status_data.get("win_rate") if account and account.status_data else None
    pf = account.status_data.get("profit_factor") if account and account.status_data else None

    return PerformanceSummary(
        account_login=login, broker=rows[0].broker if rows else "",
        equity_curve=equity_curve, total_pnl_usd=round(total_pnl, 2),
        max_drawdown_pct=round(max_dd, 2), win_rate=wr, profit_factor=pf, n_snapshots=len(rows)
    )

@router.post("/close-position")
async def close_position(request: ClosePositionRequest, db: Session = Depends(get_db), user: User = Depends(require_dev)):
    account = db.query(Account).filter(Account.id == request.account_id).first()
    if not account or not account.server:
        raise HTTPException(status_code=404, detail="Cuenta o servidor no encontrado")

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(f"{account.server}/close/{request.ticket}")
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail="Error en el EA")
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))

    db.add(Alert(
        account_login=account.login, broker=account.broker, severity="info",
        event_type="manual_close", message=f"Cierre manual ticket #{request.ticket} por {user.username}",
        acknowledged=True
    ))

    # Audit Log (Institutional Requirement)
    AuditService.log_action(
        db,
        action="MANUAL_CLOSE_POSITION",
        user_id=user.id,
        username=user.username,
        resource=f"Account {account.login} | Ticket {request.ticket}",
        details={"ticket": request.ticket, "account_id": account.id}
    )

    db.commit()

    return {"status": "closed", "ticket": request.ticket}

@router.get("/alerts", response_model=List[AlertResponse])
async def get_alerts(acknowledged: Optional[bool] = None, limit: int = 100, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    q = db.query(Alert)
    if acknowledged is not None:
        q = q.filter(Alert.acknowledged == acknowledged)
    return q.order_by(Alert.timestamp_utc.desc()).limit(limit).all()
