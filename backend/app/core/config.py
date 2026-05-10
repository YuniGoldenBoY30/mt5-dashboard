from typing import List
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # OWASP: Cero hardcoding de secretos. Falla inmediatamente si falta el .env
    app_env: str = "production" # development | production
    database_url: str
    secret_key: str
    algorithm: str = "HS256"
    vps_endpoints: str = ""
    vps_secret_token: str
    x_api_key: str  # Llave de firewall global para cabeceras X-API-KEY
    vps_allowed_ips: str = "*" # Separated by comma, e.g. "1.2.3.4,5.6.7.8"
    rate_limit_requests: int = 1200 # Requests per minute per IP
    rate_limit_telemetry_requests: int = 1200 # Requests per minute per IP for MT5 telemetry
    rate_limit_auth_requests: int = 60 # Requests per minute per IP for login/auth endpoints
    rate_limit_default_requests: int = 300 # Requests per minute per IP for the rest of the API
    session_timeout_min: int = 60
    frontend_url: str  # Necesario para CORS estricto
    admin_team_password: str
    admin_dev_password: str

    # Email alerts
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_use_tls: bool = True
    alert_sender_email: str = "alerts@example.com"
    alert_recipient_emails: str = ""   # comma-separated
    alert_email_enabled: bool = False

    @property
    def vps_list(self) -> List[str]:
        return [u.strip() for u in self.vps_endpoints.split(",") if u.strip()]

    @property
    def alert_recipient_list(self) -> List[str]:
        return [e.strip() for e in self.alert_recipient_emails.split(",") if e.strip()]

    class Config:
        env_file = ".env"

settings = Settings()
