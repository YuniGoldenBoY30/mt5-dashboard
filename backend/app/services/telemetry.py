import hashlib
import logging
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.orm import Session
from app.models.models import TelemetryHistory, Account
from app.schemas.schemas import AccountTelemetry, VpsTelemetryPayload

log = logging.getLogger("mt5-dashboard")

# Tolerancia maxima entre TimeGMT() del VPS y reloj canonico del Dashboard.
# Si el VPS reloj se desfasa mas de esto, levantamos alerta NTP_SKEW.
NTP_SKEW_TOLERANCE_SECONDS = 60


class TelemetryService:
    @staticmethod
    def calculate_snapshot_hash(account_login: str, timestamp: datetime, equity: float, prev_hash: Optional[str]) -> str:
        payload = f"{account_login}|{timestamp.isoformat()}|{equity}|{prev_hash or 'GENESIS'}"
        return hashlib.sha256(payload.encode()).hexdigest()

    @staticmethod
    def detect_ntp_skew(vps_payload: VpsTelemetryPayload) -> Optional[float]:
        """
        Compara timestamp_utc (TimeGMT del VPS) contra el reloj del Dashboard.
        Devuelve la diferencia en segundos si supera la tolerancia, sino None.
        """
        if vps_payload.timestamp_utc is None:
            return None
        ts_vps = vps_payload.timestamp_utc
        if ts_vps.tzinfo is None:
            ts_vps = ts_vps.replace(tzinfo=timezone.utc)
        diff_sec = abs((datetime.now(timezone.utc) - ts_vps).total_seconds())
        return diff_sec if diff_sec > NTP_SKEW_TOLERANCE_SECONDS else None

    @classmethod
    def process_telemetry(cls, db: Session, vps_payload: VpsTelemetryPayload):
        # Fix bug naive datetime: usar siempre UTC explicito
        now_utc = datetime.now(timezone.utc)

        # Validar NTP-skew del VPS
        skew = cls.detect_ntp_skew(vps_payload)
        if skew is not None:
            log.warning(
                f"NTP_SKEW detected: vps_id={vps_payload.vps_id} timestamp_utc={vps_payload.timestamp_utc} "
                f"differs from dashboard now() by {skew:.1f}s (tolerance={NTP_SKEW_TOLERANCE_SECONDS}s)"
            )

        updated_accounts = []
        for acc in vps_payload.accounts:
            login_str = str(acc.account_id)
            account = db.query(Account).filter(Account.broker == acc.broker, Account.login == login_str).first()

            payload_dict = acc.model_dump()
            payload_dict["timestamp"] = vps_payload.timestamp_utc.isoformat()
            # Anexar metadatos UTC 3-timestamp para auditoria forense en status_data
            if vps_payload.broker_time is not None:
                payload_dict["broker_time"] = vps_payload.broker_time.isoformat()
            if vps_payload.broker_offset_seconds is not None:
                payload_dict["broker_offset_seconds"] = vps_payload.broker_offset_seconds
            if skew is not None:
                payload_dict["ntp_skew_seconds"] = skew

            if not account:
                account = Account(
                    broker=acc.broker, login=login_str, server=vps_payload.vps_id,
                    name=acc.name, status_data=payload_dict
                )
                # Si el payload ya era historico, intentamos reflejarlo (aunque lo ideal es que inicie con data en vivo)
                if acc.regime != "HISTORICAL":
                    account.last_update = vps_payload.timestamp_utc
                db.add(account)
            else:
                # Solo actualizar el estado "en vivo" si este payload no es historico o si es mas nuevo que el ultimo
                is_historical = (acc.regime == "HISTORICAL" or acc.active_mode == "SYNC")
                is_newer = account.last_update is None or vps_payload.timestamp_utc > account.last_update.replace(tzinfo=timezone.utc)
                
                if not is_historical or is_newer:
                    account.status_data = payload_dict
                    account.server = vps_payload.vps_id
                    account.last_update = vps_payload.timestamp_utc

            # Hash Chains
            last_snap = db.query(TelemetryHistory).filter(TelemetryHistory.account_login == login_str).order_by(TelemetryHistory.timestamp_utc.desc()).first()
            p_hash = last_snap.record_hash if last_snap else None
            curr_hash = cls.calculate_snapshot_hash(login_str, vps_payload.timestamp_utc, acc.equity, p_hash)

            snap = TelemetryHistory(
                account_login=login_str, broker=acc.broker, balance=acc.balance,
                equity=acc.equity, drawdown_pct=acc.drawdown_pct, daily_pnl_usd=acc.daily_pnl_usd,
                open_risk_pct=acc.open_risk_pct, regime=acc.regime, active_mode=acc.active_mode,
                n_positions=len(acc.positions), timestamp_utc=vps_payload.timestamp_utc,
                prev_hash=p_hash, record_hash=curr_hash
            )
            db.add(snap)

            # Persistir historial de operaciones en tabla dedicada
            from app.models.models import ClosedTrade
            if acc.closed_trades:
                for trade in acc.closed_trades:
                    # Upsert por ticket
                    existing_trade = db.query(ClosedTrade).filter(ClosedTrade.ticket == trade.get("ticket")).first()
                    if not existing_trade:
                        close_time = trade.get("close_time_utc")
                        if isinstance(close_time, str):
                            close_time = datetime.fromisoformat(close_time.replace("Z", "+00:00"))
                        
                        new_trade = ClosedTrade(
                            account_login=login_str,
                            ticket=trade.get("ticket"),
                            symbol=trade.get("symbol"),
                            trade_type=trade.get("type"),
                            close_time_utc=close_time,
                            profit_net=trade.get("profit_net")
                        )
                        db.add(new_trade)

            updated_accounts.append(account)
        
        return updated_accounts
