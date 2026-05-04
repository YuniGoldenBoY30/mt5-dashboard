import asyncio
import logging
from datetime import datetime, timezone
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, Request, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
import time
from collections import defaultdict


from app.core.config import settings
from app.core.security import get_password_hash, verify_api_key

from app.db.session import engine, SessionLocal, Base, get_db
from app.models.models import User, Account
from app.services.websocket import manager
from app.api.v1 import auth, telemetry, dashboard

# Configuración de Logging
logging.basicConfig(level=logging.INFO)
log = logging.getLogger("mt5-dashboard")

app = FastAPI(
    title="QuantFib Micro-SaaS API",
    version="3.0.0",
    description="Backend modular de alta cohesión para el monitoreo de agentes RL",
)



# Rate Limiter Simple (In-Memory) - Para producción usar Redis
rate_limit_store = defaultdict(list)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://trading.zenixtech.ai",
        "http://trading.zenixtech.ai",
        "http://localhost:8080",
        "http://localhost:8082"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=3600,
)

@app.middleware("http")
async def diagnostic_logging_middleware(request: Request, call_next):
    # Log de depuración para 403
    log.info(f"Petición: {request.method} {request.url}")
    log.info(f"Headers: {dict(request.headers)}")
    response = await call_next(request)
    log.info(f"Respuesta: {response.status_code}")
    return response

@app.middleware("http")
async def security_hardening_middleware(request: Request, call_next):
    # 1. Rate Limiting
    client_ip = request.client.host
    now = time.time()
    rate_limit_store[client_ip] = [t for t in rate_limit_store[client_ip] if now - t < 60]
    if len(rate_limit_store[client_ip]) >= settings.rate_limit_requests:
        return JSONResponse(status_code=429, content={"detail": "Too many requests. DDoS protection active."})
    rate_limit_store[client_ip].append(now)

    # 2. Process request
    response = await call_next(request)

    # 3. Security Headers (OWASP Recommendations)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com;"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    
    return response

# CORS Flexible para Desarrollo, Estricto para Producción
origins = [
    settings.frontend_url,
    "https://trading.zenixtech.ai",
    "http://trading.zenixtech.ai"
]
if settings.app_env == "development":
    origins.extend([
        "http://localhost:8082",
        "http://127.0.0.1:8082",
        "http://localhost:5173",
    ])

# Middleware de CORS se movió arriba para prioridad de ejecución



# Rutas
app.include_router(auth.router, prefix="/api/v1", tags=["Auth"])
app.include_router(telemetry.router, prefix="/api/v1", tags=["Telemetry"], dependencies=[Depends(verify_api_key)])
app.include_router(dashboard.router, prefix="/api/v1", tags=["Dashboard"], dependencies=[Depends(verify_api_key)])


# WebSockets
@app.websocket("/ws/accounts")
async def websocket_accounts(websocket: WebSocket, db: Session = Depends(get_db)):
    await manager.connect(websocket)
    try:
        # Estado inicial
        accounts = db.query(Account).filter(Account.is_active == True).all()
        await websocket.send_json({
            "type": "accounts_update",
            "data": [
                {
                    "id": a.id, "broker": a.broker, "login": a.login,
                    "server": a.server, "name": a.name,
                    "last_update": a.last_update.isoformat() if a.last_update else None,
                    "status_data": a.status_data,
                }
                for a in accounts
            ]
        })
        while True:
            msg = await websocket.receive_text()
            if msg == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        manager.disconnect(websocket)

# Background Loops
async def broadcast_loop():
    while True:
        try:
            db = SessionLocal()
            accounts = db.query(Account).filter(Account.is_active == True).all()
            data = [
                {
                    "id": a.id, "broker": a.broker, "login": a.login,
                    "server": a.server, "name": a.name,
                    "last_update": a.last_update.isoformat() if a.last_update else None,
                    "status_data": a.status_data,
                }
                for a in accounts
            ]
            db.close()
            if manager.active:
                await manager.broadcast({"type": "accounts_update", "data": data})
        except Exception as e:
            log.error(f"Broadcast error: {e}")
        await asyncio.sleep(10)

@app.on_event("startup")
async def startup_event():
    # DB Init
    Base.metadata.create_all(bind=engine)
    
    # Crear usuarios admin si no existen
    db = SessionLocal()
    try:
        if not db.query(User).filter(User.username == "team").first():
            db.add_all([
                User(username="team", hashed_password=get_password_hash(settings.admin_team_password), role="team"),
                User(username="dev", hashed_password=get_password_hash(settings.admin_dev_password), role="dev"),
            ])
            db.commit()
            log.info("Admin accounts initialized securely.")
    finally:
        db.close()

    asyncio.create_task(broadcast_loop())
    log.info("QuantFib Micro-SaaS Backend Started ✓")

@app.get("/health")
async def health():
    return {"status": "healthy", "version": "3.0.0", "timestamp": datetime.now(timezone.utc)}
