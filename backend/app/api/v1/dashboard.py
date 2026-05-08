from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import httpx
from app.core.security import get_current_user, require_dev
from app.db.session import get_db
from app.models.models import Account, TelemetryHistory, Alert, User
from app.schemas.schemas import AccountStatus, PerformanceSummary, EquityPoint, AlertResponse, ClosePositionRequest, AccountReportResponse, ReportSummary, ReportIndicators, ReportBalance, ReportChartPoint
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

@router.get("/report/{login}", response_model=AccountReportResponse)
async def get_account_report(
    login: str, limit: int = 1000,
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    account = db.query(Account).filter(Account.login == login).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    query = db.query(TelemetryHistory).filter(TelemetryHistory.account_login == login)
    rows = query.order_by(TelemetryHistory.timestamp_utc.asc()).limit(limit).all()
    
    if not rows:
        raise HTTPException(status_code=404, detail="No telemetry data for this account")

    sd = account.status_data or {}
    
    # 1. Base Info
    account_info = {
        "name": sd.get("name", account.name or ""),
        "currency": "USD",
        "type": sd.get("account_type", "unknown").lower(),
        "broker": account.broker,
        "account": login,
        "digits": 2
    }

    # 2. Extract initial balance
    # In MT5 initial balance usually counts as a deposit
    initial_balance = sd.get("initial_balance", rows[0].balance)
    
    # 3. Chart & Balance
    chart_points = []
    baseline_balance = initial_balance
    prev_raw_balance = rows[0].balance if rows else initial_balance
    
    for r in rows:
        balance_delta = r.balance - prev_raw_balance
        baseline_balance += balance_delta
        floating_pnl = r.equity - r.balance
        equity_display = baseline_balance + floating_pnl
        
        # timestamp to seconds
        ts_sec = int(r.timestamp_utc.timestamp())
        chart_points.append(ReportChartPoint(x=ts_sec, y=[round(baseline_balance, 2), round(equity_display, 2)]))
        prev_raw_balance = r.balance

    current_balance = chart_points[-1].y[0] if chart_points else initial_balance
    current_equity = chart_points[-1].y[1] if chart_points else initial_balance
    
    gain = (current_equity - initial_balance) / initial_balance if initial_balance > 0 else 0.0

    # 4. Indicators (approx from status_data where exact history requires full deals)
    pf = sd.get("profit_factor", 0.0)
    dd = sd.get("max_drawdown_pct", 0.0)
    
    # For now, hardcode or approximate missing advanced MT5 stats:
    summary = ReportSummary(
        gain=round(gain * 100, 4), # Usually MT5 puts fraction, e.g. -0.420220 = -42%, wait, let's keep MT5 format: -0.42 for -42%
        activity=0.0, # Placeholder
        deposit=[initial_balance, 1],
        withdrawal=[0.0, 0],
        dividend=0.0,
        correction=0.0,
        credit=0.0
    )
    # Gain in MT5 HTML is a decimal fraction (e.g. -0.420220 means -42.02%)
    summary.gain = round(gain, 6)

    indicators = ReportIndicators(
        sharp_ratio=0.0, # Not calculated in EA
        profit_factor=round(pf, 6) if pf else 0.0,
        recovery_factor=0.0, # Not calculated in EA
        drawdown=round(dd / 100, 6), # status_data has percentage (e.g. 7.7%), MT5 report wants decimal (0.077)
        deposit_load=round(sd.get("open_risk_pct", 0.0) / 100, 6), 
        trades_per_week=0.0, 
        hold_time=0.0
    )

    report_balance = ReportBalance(
        balance=round(current_balance, 6),
        equity=round(current_equity, 6),
        period=86400, # Approx
        chart=chart_points
    )

    return AccountReportResponse(
        account=account_info,
        summary=summary,
        summaryIndicators=indicators,
        balance=report_balance,
        table=None # Phase 2
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
