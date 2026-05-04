import logging
from sqlalchemy.orm import Session
from app.models.models import AuditLog
from typing import Optional, Any

log = logging.getLogger("mt5-dashboard")

class AuditService:
    @staticmethod
    def log_action(
        db: Session,
        action: str,
        user_id: Optional[int] = None,
        username: Optional[str] = None,
        resource: Optional[str] = None,
        ip_address: Optional[str] = None,
        details: Optional[Any] = None
    ):
        try:
            audit_entry = AuditLog(
                user_id=user_id,
                username=username,
                action=action,
                resource=resource,
                ip_address=ip_address,
                details=details
            )
            db.add(audit_entry)
            db.commit()
            log.info(f"Audit: {username} performed {action} on {resource}")
        except Exception as e:
            log.error(f"Failed to write audit log: {e}")
            db.rollback()
