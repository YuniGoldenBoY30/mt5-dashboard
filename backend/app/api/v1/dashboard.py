from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.security import get_current_user, require_dev
from app.db.session import get_db
from app.models.models import Account, TelemetryHistory, Alert, User, ClosedTrade, TradeCommand
from app.schemas.schemas import AccountStatus, PerformanceSummary, EquityPoint, AlertResponse, ClosePositionRequest, ClosePositionResponse, AccountReportResponse, ReportSummary, ReportIndicators, ReportBalance, ReportChartPoint
from app.services.audit import AuditService


router = APIRouter()

@router.get("/accounts/{login}/trades")
async def get_account_trades(
    login: str, limit: int = 1000,
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    query = db.query(ClosedTrade).filter(ClosedTrade.account_login == login)
    rows = query.order_by(ClosedTrade.close_time_utc.desc()).limit(limit).all()
    
    return [{
        "ticket": r.ticket,
        "symbol": r.symbol,
        "type": r.trade_type,
        "close_time_utc": r.close_time_utc.isoformat(),
        "profit_net": r.profit_net
    } for r in rows]

@router.get("/accounts", response_model=List[AccountStatus])
async def get_accounts(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return db.query(Account).filter(Account.is_active == True).all()

def build_historical_curve(db: Session, login: str, limit: int, sampling_minutes: Optional[int] = None) -> List[EquityPoint]:
    account = db.query(Account).filter(Account.login == login).first()
    initial_balance = account.status_data.get("initial_balance", 0.0) if account and account.status_data else 0.0

    trades = db.query(ClosedTrade).filter(ClosedTrade.account_login == login).order_by(ClosedTrade.close_time_utc.asc()).all()
    telemetry_rows = db.query(TelemetryHistory).filter(TelemetryHistory.account_login == login).order_by(TelemetryHistory.timestamp_utc.asc()).all()

    first_telemetry_ts = telemetry_rows[0].timestamp_utc if telemetry_rows else None

    points = []
    import datetime

    # Punto inicial
    if initial_balance > 0 and (trades or telemetry_rows):
        start_ts = trades[0].close_time_utc if trades else telemetry_rows[0].timestamp_utc
        start_ts = start_ts - datetime.timedelta(hours=1)
        points.append(
            EquityPoint(
                timestamp_utc=start_ts,
                balance=initial_balance,
                equity=initial_balance,
                drawdown_pct=0.0,
                daily_pnl_usd=0.0,
                regime="HISTORICAL",
                active_mode="UNKNOWN"
            )
        )

    current_balance = initial_balance

    # Curva basada en trades (cerrados antes de que la telemetria iniciara)
    for t in trades:
        # Se ignora si ya habia telemetria, la telemetria tiene precedencia
        if first_telemetry_ts and t.close_time_utc >= first_telemetry_ts:
            break
        current_balance += t.profit_net
        points.append(
            EquityPoint(
                timestamp_utc=t.close_time_utc,
                balance=current_balance,
                equity=current_balance,
                drawdown_pct=0.0,
                daily_pnl_usd=0.0,
                regime="HISTORICAL",
                active_mode="UNKNOWN"
            )
        )

    # Anexar curva en vivo de telemetria
    for r in telemetry_rows:
        points.append(
            EquityPoint(
                timestamp_utc=r.timestamp_utc,
                balance=r.balance,
                equity=r.equity,
                drawdown_pct=r.drawdown_pct,
                daily_pnl_usd=r.daily_pnl_usd,
                regime=r.regime,
                active_mode=r.active_mode
            )
        )

    # Downsampling si es necesario para optimizar renderizado frontend
    if sampling_minutes and len(points) > 50:
        sampled = [points[0]]
        last_ts = points[0].timestamp_utc
        for p in points[1:]:
            if (p.timestamp_utc - last_ts).total_seconds() >= (sampling_minutes * 60):
                sampled.append(p)
                last_ts = p.timestamp_utc
        if points[-1] not in sampled:
            sampled.append(points[-1])
        points = sampled

    # Aplicar limite tomando los mas recientes, pero siempre conservando el punto cero si es posible
    if limit and len(points) > limit:
        # Si queremos mantener el inicio, conservamos el punto 0 y tomamos los limit-1 más recientes
        p0 = points[0]
        points = points[-(limit-1):]
        points.insert(0, p0)

    return points


@router.get("/performance/{login}", response_model=PerformanceSummary)
async def get_performance(
    login: str, limit: int = 1000, sampling_minutes: Optional[int] = None,
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    equity_curve = build_historical_curve(db, login, limit, sampling_minutes)
    
    total_pnl = (equity_curve[-1].equity - equity_curve[0].equity) if len(equity_curve) >= 2 else 0.0
    max_dd = max((p.drawdown_pct for p in equity_curve), default=0.0)
    
    account = db.query(Account).filter(Account.login == login).first()
    wr = account.status_data.get("win_rate") if account and account.status_data else None
    pf = account.status_data.get("profit_factor") if account and account.status_data else None
    broker = account.broker if account else ""

    return PerformanceSummary(
        account_login=login, broker=broker,
        equity_curve=equity_curve, total_pnl_usd=round(total_pnl, 2),
        max_drawdown_pct=round(max_dd, 2), win_rate=wr, profit_factor=pf, n_snapshots=len(equity_curve)
    )

@router.get("/report/{login}", response_model=AccountReportResponse)
async def get_account_report(
    login: str, limit: int = 2000,
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    account = db.query(Account).filter(Account.login == login).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    equity_curve = build_historical_curve(db, login, limit, None)
    
    if not equity_curve:
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

    initial_balance = equity_curve[0].balance if len(equity_curve) > 0 else 0.0
    
    # 3. Chart & Balance
    chart_points = []
    for p in equity_curve:
        ts_sec = int(p.timestamp_utc.timestamp())
        chart_points.append(ReportChartPoint(x=ts_sec, y=[round(p.balance, 2), round(p.equity, 2)]))

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

    # 5. Build Monthly/Yearly Table
    from collections import defaultdict
    import datetime
    
    # group by year and month using the normalized equity
    years_data = defaultdict(lambda: defaultdict(list))
    for p, cp in zip(equity_curve, chart_points):
        y = p.timestamp_utc.year
        m = p.timestamp_utc.month
        # cp.y[1] is equity_display
        years_data[y][m].append(cp.y[1])

    table_years = []
    for y in sorted(years_data.keys()):
        months_dict = years_data[y]
        year_months = {}
        year_first_eq = None
        year_last_eq = None
        
        for m in range(1, 13):
            if m in months_dict:
                snaps = months_dict[m]
                first_e = snaps[0]
                last_e = snaps[-1]
                
                if year_first_eq is None:
                    year_first_eq = first_e
                year_last_eq = last_e
                
                ret = ((last_e - first_e) / first_e * 100) if first_e > 0 else 0.0
                year_months[str(m)] = round(ret, 2)
                
        year_total = 0.0
        if year_first_eq and year_first_eq > 0 and year_last_eq:
            year_total = ((year_last_eq - year_first_eq) / year_first_eq) * 100
            
        table_years.append({
            "year": y,
            "months": year_months,
            "total": round(year_total, 2)
        })

    report_table = {"years": table_years} if table_years else None

    return AccountReportResponse(
        account=account_info,
        summary=summary,
        summaryIndicators=indicators,
        balance=report_balance,
        table=report_table
    )

@router.post("/close-position", response_model=ClosePositionResponse)
async def close_position(request: ClosePositionRequest, db: Session = Depends(get_db), user: User = Depends(require_dev)):
    account = db.query(Account).filter(Account.id == request.account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Cuenta no encontrada")

    existing_command = (
        db.query(TradeCommand)
        .filter(
            TradeCommand.account_login == account.login,
            TradeCommand.action == "close_position",
            TradeCommand.ticket == request.ticket,
            TradeCommand.status == "pending",
        )
        .order_by(TradeCommand.created_at.desc())
        .first()
    )

    if existing_command:
        return ClosePositionResponse(
            status="queued",
            ticket=request.ticket,
            command_id=existing_command.id,
            message="Ya existe una orden pendiente para este ticket",
        )

    command = TradeCommand(
        account_login=account.login,
        action="close_position",
        ticket=request.ticket,
        status="pending",
        result_message=f"Solicitado por {user.username}",
    )
    db.add(command)
    db.flush()

    db.add(Alert(
        account_login=account.login, broker=account.broker, severity="info",
        event_type="manual_close_requested", message=f"Solicitud de cierre ticket #{request.ticket} por {user.username}",
        payload={"ticket": request.ticket, "command_id": command.id, "status": "pending"},
        acknowledged=True
    ))

    # Audit Log (Institutional Requirement)
    AuditService.log_action(
        db,
        action="MANUAL_CLOSE_POSITION",
        user_id=user.id,
        username=user.username,
        resource=f"Account {account.login} | Ticket {request.ticket}",
        details={"ticket": request.ticket, "account_id": account.id, "command_id": command.id, "status": "pending"}
    )

    db.commit()

    return ClosePositionResponse(
        status="queued",
        ticket=request.ticket,
        command_id=command.id,
        message="La orden se enviara al EA en el siguiente ciclo de telemetria",
    )

@router.get("/alerts", response_model=List[AlertResponse])
async def get_alerts(acknowledged: Optional[bool] = None, limit: int = 100, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    q = db.query(Alert)
    if acknowledged is not None:
        q = q.filter(Alert.acknowledged == acknowledged)
    return q.order_by(Alert.timestamp_utc.desc()).limit(limit).all()
