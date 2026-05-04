import logging
import aiosmtplib
from email.message import EmailMessage
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.orm import Session
from app.core.config import settings
from app.models.models import Alert
from app.schemas.schemas import AccountTelemetry, VpsTelemetryPayload

log = logging.getLogger("mt5-dashboard")

DD_WARN_THRESHOLD = 10.0
DD_CRITICAL_THRESHOLD = 20.0

# NTP-skew thresholds (segundos entre TimeGMT del VPS y reloj del Dashboard)
NTP_SKEW_WARN_SECONDS = 60     # 1 min: amarillo
NTP_SKEW_CRITICAL_SECONDS = 300  # 5 min: rojo (datos no fiables)

async def send_alert_email(alert: Alert):
    if not settings.alert_email_enabled:
        return
    
    msg = EmailMessage()
    msg["Subject"] = f"⚠️ ALERTA QUANTFIB: {alert.severity.upper()} - {alert.event_type}"
    msg["From"] = settings.alert_sender_email
    msg["To"] = settings.alert_recipient_emails
    msg.set_content(f"Evento: {alert.event_type}\nSeveridad: {alert.severity}\nCuenta: {alert.account_login}\n\n{alert.message}")

    try:
        await aiosmtplib.send(
            msg,
            hostname=settings.smtp_host,
            port=settings.smtp_port,
            username=settings.smtp_user,
            password=settings.smtp_password,
            use_tls=settings.smtp_use_tls,
        )
        log.info(f"Email de alerta enviado a {settings.alert_recipient_emails}")
    except Exception as e:
        log.error(f"Error enviando email: {e}")

class AlertService:
    @staticmethod
    def check_and_create_alerts(db: Session, payload: AccountTelemetry):
        alerts_to_add = []
        login_str = str(payload.account_id)

        # Drawdown
        if payload.drawdown_pct >= DD_CRITICAL_THRESHOLD:
            alerts_to_add.append(Alert(
                account_login=login_str, broker=payload.broker,
                severity="critical", event_type="dd_breach",
                message=f"Drawdown crítico: {payload.drawdown_pct:.1f}% en cuenta {login_str}"
            ))
        elif payload.drawdown_pct >= DD_WARN_THRESHOLD:
            recent = db.query(Alert).filter(Alert.account_login == login_str, Alert.event_type == "dd_breach", Alert.acknowledged == False).first()
            if not recent:
                alerts_to_add.append(Alert(
                    account_login=login_str, broker=payload.broker,
                    severity="warning", event_type="dd_breach",
                    message=f"Drawdown elevado: {payload.drawdown_pct:.1f}% en cuenta {login_str}"
                ))

        # Mode Change
        if payload.active_mode in ("PAUSE", "GUARD"):
            recent = db.query(Alert).filter(Alert.account_login == login_str, Alert.event_type == "mode_change", Alert.acknowledged == False).first()
            if not recent:
                alerts_to_add.append(Alert(
                    account_login=login_str, broker=payload.broker,
                    severity="warning" if payload.active_mode == "GUARD" else "critical",
                    event_type="mode_change",
                    message=f"Modo adaptativo: {payload.active_mode} en cuenta {login_str}"
                ))

        for a in alerts_to_add:
            db.add(a)
        return alerts_to_add

    @staticmethod
    def check_ntp_skew_alert(
        db: Session, vps_payload: VpsTelemetryPayload
    ) -> Optional[Alert]:
        """
        Genera alerta si el reloj del VPS (TimeGMT) divergente del Dashboard.

        Multi-VPS deployment: cada VPS tiene su propio reloj NTP. Si uno se
        desfasa, todos los timestamps del VPS son sospechosos -> los modelos
        adaptativos pueden interpretar mal el regimen actual.

        Severities:
          - warning  : 60s - 5min de skew (alertar pero no bloquear)
          - critical : >5min de skew (datos no fiables, considerar pausa)
        """
        if vps_payload.timestamp_utc is None:
            return None

        ts_vps = vps_payload.timestamp_utc
        if ts_vps.tzinfo is None:
            ts_vps = ts_vps.replace(tzinfo=timezone.utc)
        skew_sec = abs((datetime.now(timezone.utc) - ts_vps).total_seconds())

        if skew_sec < NTP_SKEW_WARN_SECONDS:
            return None  # OK

        # Evitar duplicar alertas no-acknowledged del mismo VPS
        existing = (
            db.query(Alert)
            .filter(
                Alert.account_login == f"VPS:{vps_payload.vps_id}",
                Alert.event_type == "ntp_skew",
                Alert.acknowledged == False,  # noqa: E712
            )
            .first()
        )
        if existing:
            return None

        severity = "critical" if skew_sec >= NTP_SKEW_CRITICAL_SECONDS else "warning"
        msg = (
            f"VPS reloj desfasado {skew_sec:.1f}s vs Dashboard. "
            f"VPS={vps_payload.vps_id}, broker_offset={vps_payload.broker_offset_seconds}s. "
            f"Verificar NTP del VPS o pausar telemetria si es critico."
        )
        alert = Alert(
            account_login=f"VPS:{vps_payload.vps_id}",
            broker="N/A",
            severity=severity,
            event_type="ntp_skew",
            message=msg,
            payload={
                "skew_seconds": skew_sec,
                "vps_id": vps_payload.vps_id,
                "broker_offset_seconds": vps_payload.broker_offset_seconds,
                "vps_timestamp": vps_payload.timestamp_utc.isoformat(),
                "dashboard_now": datetime.now(timezone.utc).isoformat(),
            },
        )
        db.add(alert)
        log.warning(f"[NTP_SKEW] {msg}")
        return alert
