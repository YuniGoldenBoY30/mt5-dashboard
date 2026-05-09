import asyncio
from typing import List
from fastapi import APIRouter, Depends, Request, HTTPException
from sqlalchemy.orm import Session
from app.core.config import settings

from app.core.security import verify_vps_token
from app.db.session import get_db
from app.models.models import Alert, TradeCommand
from app.schemas.schemas import TelemetryResponse, TradeCommandPayload, VpsTelemetryPayload
from app.services.telemetry import TelemetryService
from app.services.alert_engine import AlertService, send_alert_email
from app.services.websocket import manager

router = APIRouter()


def apply_command_results(db: Session, request_data: VpsTelemetryPayload) -> None:
    for result in request_data.command_results:
        command = db.query(TradeCommand).filter(TradeCommand.id == result.command_id).first()
        if not command:
            continue

        normalized_status = (result.status or "").lower()
        if normalized_status not in {"executed", "failed"}:
            continue

        command.status = normalized_status
        command.result_message = result.message

        if normalized_status == "failed":
            db.add(
                Alert(
                    account_login=command.account_login,
                    broker="",
                    severity="warning",
                    event_type="manual_close_failed",
                    message=f"Fallo el cierre manual del ticket #{command.ticket}: {result.message or 'Sin detalle'}",
                    payload={"ticket": command.ticket, "command_id": command.id},
                    acknowledged=False,
                )
            )
        else:
            db.add(
                Alert(
                    account_login=command.account_login,
                    broker="",
                    severity="info",
                    event_type="manual_close_executed",
                    message=f"Cierre manual ejecutado para ticket #{command.ticket}",
                    payload={"ticket": command.ticket, "command_id": command.id},
                    acknowledged=True,
                )
            )


def collect_pending_commands(db: Session, request_data: VpsTelemetryPayload) -> List[TradeCommandPayload]:
    account_logins = list({str(acc.account_id) for acc in request_data.accounts})
    if not account_logins:
        return []

    commands = (
        db.query(TradeCommand)
        .filter(
            TradeCommand.account_login.in_(account_logins),
            TradeCommand.status == "pending",
        )
        .order_by(TradeCommand.created_at.asc())
        .all()
    )

    return [
        TradeCommandPayload(
            id=command.id,
            account_login=command.account_login,
            action=command.action,
            ticket=command.ticket,
        )
        for command in commands
    ]

@router.post("/telemetry", status_code=200, response_model=TelemetryResponse)
async def update_telemetry(
    request_data: VpsTelemetryPayload,
    request: Request,
    db: Session = Depends(get_db),
    token: str = Depends(verify_vps_token)
):
    # IP Whitelisting
    client_ip = request.client.host
    if settings.vps_allowed_ips != "*":
        allowed_list = [ip.strip() for ip in settings.vps_allowed_ips.split(",")]
        if client_ip not in allowed_list:
            raise HTTPException(status_code=403, detail="IP unauthorized. Access denied.")

    apply_command_results(db, request_data)
    updated_accounts = TelemetryService.process_telemetry(db, request_data)

    # Alertas
    for acc in request_data.accounts:
        alerts = AlertService.check_and_create_alerts(db, acc)
        for alert in alerts:
            asyncio.create_task(send_alert_email(alert))

    db.commit()

    # Broadcast
    if manager.active:
        ws_data = [
            {
                "id": a.id, "broker": a.broker, "login": a.login,
                "server": a.server, "name": a.name,
                "last_update": a.last_update.isoformat() if a.last_update else None,
                "status_data": a.status_data,
            }
            for a in updated_accounts
        ]
        asyncio.create_task(manager.broadcast({"type": "accounts_update", "data": ws_data}))

    pending_commands = collect_pending_commands(db, request_data)

    return TelemetryResponse(
        status="ok",
        processed_accounts=len(updated_accounts),
        commands=pending_commands,
    )

@router.post("/telemetry/bulk", status_code=200)
@router.post("/bulk", status_code=200)
async def bulk_import_telemetry(
    payloads: List[VpsTelemetryPayload],
    db: Session = Depends(get_db),
    token: str = Depends(verify_vps_token)
):
    """Importación masiva de estados históricos."""
    total_processed = 0
    for p in payloads:
        TelemetryService.process_telemetry(db, p)
        total_processed += len(p.accounts)
    
    db.commit()
    return {"status": "bulk_ok", "records_processed": total_processed}
