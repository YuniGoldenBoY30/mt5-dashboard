import asyncio
from fastapi import APIRouter, Depends, Request, HTTPException
from sqlalchemy.orm import Session
from app.core.config import settings

from app.core.security import verify_vps_token
from app.db.session import get_db
from app.schemas.schemas import VpsTelemetryPayload
from app.services.telemetry import TelemetryService
from app.services.alert_engine import AlertService, send_alert_email
from app.services.websocket import manager

router = APIRouter()

@router.post("/telemetry", status_code=200)
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

    updated_accounts = TelemetryService.process_telemetry(db, request_data)

    
    # Alertas
    for acc in request.accounts:
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

    return {"status": "ok", "processed_accounts": len(updated_accounts)}
