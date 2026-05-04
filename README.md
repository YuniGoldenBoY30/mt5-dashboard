# MT5 Multi-Account Dashboard (Local + VPS)

Dashboard local seguro para monitoreo de múltiples cuentas MT5 distribuidas en múltiples VPS, con integración QuantFib RL.

## Objetivo

Centralizar métricas de cuentas MT5 (balance, equity, DD, posiciones, historial, PnL) en tiempo real, con:

- **Backend**: FastAPI + WebSocket + JWT/RBAC
- **Frontend**: React 18 + TypeScript + Tailwind CSS + Recharts
- **DB**: PostgreSQL (producción), SQLite (desarrollo/testing)
- **Infra**: Docker Compose + Nginx reverse proxy
- **Fuentes de datos**:
  - Bot QuantFib (Python) → envía telemetría vía HTTP POST `/api/v1/telemetry`
  - EA MQL5 legacy → expone `status.json` por HTTP(S) (polling)

---

## Tabla de Contenidos

1. [Variables de entorno](#1-variables-de-entorno)
2. [Despliegue rápido (Docker)](#2-despliegue-rápido-docker)
3. [Integración con bot QuantFib](#3-integración-con-bot-quantfib)
4. [EA MQL5 Exporter (legacy)](#4-ea-mql5-exporter-legacy)
5. [Desarrollo local](#5-desarrollo-local)
6. [API Reference](#6-api-reference)
7. [Troubleshooting](#7-troubleshooting)

---

## 1. Variables de entorno

Copiar `.env.example` a `.env` y completar:

```bash
cp .env.example .env
```

### 1.1 Base de datos

```env
# PostgreSQL (producción) o SQLite (desarrollo)
DATABASE_URL=postgresql://dashboard:password@localhost/mt5_dashboard
# o para desarrollo rápido:
# DATABASE_URL=sqlite:///./dashboard.db
```

### 1.2 Seguridad

```env
SECRET_KEY=<JWT secret, mínimo 64 chars aleatorios>
VPS_SECRET_TOKEN=<token secreto para llamadas VPS polling>
FRONTEND_URL=http://localhost:3000
```

### 1.3 Cuentas admin (creadas en primer startup)

```env
ADMIN_TEAM_PASSWORD=team123_strong_password
ADMIN_DEV_PASSWORD=dev123_strong_password
```

⚠️ **Cambiar estos valores en producción**.

### 1.4 SMTP (alertas por email)

```env
# Habilitar/deshabilitar envío de alertas críticas
ALERT_EMAIL_ENABLED=false

# Configuración servidor SMTP
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu_cuenta@gmail.com
SMTP_PASSWORD=tu_app_password
SMTP_USE_TLS=true

# Remitente y destinatarios
ALERT_SENDER_EMAIL=alerts@tu_dominio.com
ALERT_RECIPIENT_EMAILS=admin1@example.com,admin2@example.com
```

### 1.5 VPS endpoints (legacy polling)

```env
# Lista separada por comas de URLs donde los EA exponen status.json
VPS_ENDPOINTS=https://vps1.example.com:8443/status.json,https://vps2.example.com:8443/status.json
```

### 1.6 Sesiones

```env
SESSION_TIMEOUT_MIN=30   # tiempo de vida del token JWT
```

---

## 2. Despliegue rápido (Docker)

### 2.1 Requisitos

- Docker + Docker Compose
- PostgreSQL (si no usas SQLite)
- Certificados TLS para producción (certs/)

### 2.2 Pasos

```bash
cd mt5-dashboard

# 1) Configurar variables
cp .env.example .env
# editar .env con valores reales

# 2) Construir y levantar
docker-compose up -d --build

# 3) Verificar
docker-compose ps
# Esperar: postgres (healthy), backend (up), frontend (up), nginx (up)
```

### 2.3 Puertos

- **Frontend**: `http://localhost:3001` (o `FRONTEND_PORT`)
- **Backend API**: `http://localhost:8000`
- **Nginx**: `http://localhost:80` (HTTP) y `443` (HTTPS)

### 2.4 Primer acceso

- URL: `http://localhost:3001/login`
- Usuario: `team` o `dev`
- Password: los definidos en `.env` (`ADMIN_TEAM_PASSWORD`, `ADMIN_DEV_PASSWORD`)

---

## 3. Integración con bot QuantFib

El bot Python QuantFib debe enviar telemetría en tiempo real al endpoint:

```
POST http://<dashboard-host>:8000/api/v1/telemetry
Content-Type: application/json
```

### 3.1 Payload completo

```json
{
  "broker": "ICMarkets",
  "login": "12345678",
  "server": "ICMarkets-Demo",
  "name": "QuantFib XAUUSD",
  "balance": 10000.0,
  "equity": 10250.5,
  "margin": 1200.0,
  "free_margin": 9050.5,
  "margin_level": 754.2,
  "drawdown_pct": 2.5,
  "regime": "TREND",
  "active_mode": "NORMAL",
  "daily_pnl_usd": 250.5,
  "open_risk_pct": 1.2,
  "win_rate": 0.58,
  "profit_factor": 1.85,
  "max_drawdown_pct": 5.2,
  "kelly_fraction": 0.015,
  "n_trades_cycle": 12,
  "last_audit": "Hash chain de la última decisión (string)",
  "positions": [
    {
      "ticket": 1001,
      "symbol": "XAUUSD",
      "type": "BUY",
      "volume": 0.1,
      "open_price": 2300.0,
      "current_price": 2310.5,
      "sl": 2288.0,
      "tp": 2320.0,
      "profit": 105.0,
      "open_time": "2026-05-02T10:30:00Z"
    }
  ],
  "timestamp": "2026-05-02T12:00:00Z"
}
```

**Campos obligatorios**: `broker`, `login`, `balance`, `equity`, `drawdown_pct`.
**Campos QuantFib**: `regime`, `active_mode`, `daily_pnl_usd`, `open_risk_pct`, `win_rate`, `profit_factor`, `kelly_fraction`, `last_audit`.

### 3.2 Ejemplo Python (requests)

```python
import requests
import json
from datetime import datetime, timezone

payload = { ... }  # como arriba
resp = requests.post(
    "http://localhost:8000/api/v1/telemetry",
    json=payload,
    timeout=5
)
print(resp.json())  # {"status":"ok","account_id":1}
```

### 3.3 Frecuencia recomendada

- **Cada barra M15 cerrada** → envía actualización.
- **Al cambiar régimen o modo** → enviar inmediatamente.
- **Al abrir/cerrar posiciones** → actualizar `positions`.

---

## 4. EA MQL5 Exporter (legacy)

> **Nota**: En desarrollo. Mientras tanto, usar envío directo desde Python.

El EA `MT5DataExporter.mq5` corre en cada VPS MT5 y escribe un archivo `status.json` en una carpeta servida por un servidor HTTP local (ej. nginx o Python SimpleHTTPServer). El backend hace polling cada 30 segundos a las URLs configuradas en `VPS_ENDPOINTS`.

### 4.1 Formato esperado de `status.json`

```json
{
  "vps_id": "vps-01",
  "timestamp_utc": "2026-05-02T12:00:00Z",
  "accounts": [
    {
      "account_id": "123456",
      "broker": "ICMarkets",
      "balance": 10000.0,
      "equity": 10250.5,
      "margin": 1200.0,
      "free_margin": 9050.5,
      "drawdown_pct": 2.3,
      "positions": [ ... ]  // mism estructura que arriba
    }
  ]
}
```

### 4.2 Configuración EA

1. Compilar `MT5DataExporter.mq5` en MetaEditor.
2. Adjuntar a un gráfico (puede ser cualquier símbolo).
3. Configurar en inputs:
   - `ExportPath`: carpeta donde escribir `status.json` (ej. `C:/inetpub/wwwroot/`)
   - `ServerPort`: puerto del web server local (ej. `8080`)
4. Iniciar web server que sirva esa carpeta (nginx, Apache, o `python -m http.server`).

### 4.3 Seguridad

- Usar HTTPS con certificado autofirmado o Let's Encrypt.
- Restringir acceso por IP (firewall) solo a la IP de tu dashboard.
- Opcional: agregar token Bearer en cabecera (pendiente implementar en backend polling).

---

## 5. Desarrollo local (sin Docker)

### 5.1 Backend

```bash
cd mt5-dashboard/backend

# Crear venv
python -m venv .venv
.venv\Scripts\Activate.ps1   # PowerShell
# o source .venv/bin/activate (Linux/macOS)

# Instalar dependencias
pip install -r requirements.txt

# Variables de entorno (desarrollo)
$env:DATABASE_URL="sqlite:///./dev.db"
$env:SECRET_KEY="dev-secret-key-64chars-long"
$env:ADMIN_TEAM_PASSWORD="team123"
$env:ADMIN_DEV_PASSWORD="dev123"
$env:ALERT_EMAIL_ENABLED="false"

# Ejecutar
uvicorn main:app --reload --port 8000

# Docs automáticas: http://localhost:8000/docs
```

### 5.2 Frontend

```bash
cd mt5-dashboard/frontend

# Instalar
npm install

# Variables de entorno (Vite)
echo "VITE_API_URL=http://localhost:8000" > .env.local

# Desarrollo
npm run dev   # http://localhost:3000

# Build producción
npm run build
```

### 5.3 Ejecutar tests backend

```bash
cd backend
pytest test_api.py -v
```

---

## 6. API Reference

### 6.1 Autenticación

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/login` | POST | Obtener JWT (body: `{username,password}`) |
| `/me` | GET | Info usuario actual (header `Authorization: Bearer <token>`) |

### 6.2 Telemetría

| Endpoint | Método | Auth | Descripción |
|----------|--------|------|-------------|
| `/api/v1/telemetry` | POST | No | Push de datos de bot/cuenta |
| `/api/ws/accounts` | WS | No | Stream de updates en tiempo real (cada 5s) |

### 6.3 Cuentas

| Endpoint | Método | Auth | Descripción |
|----------|--------|------|-------------|
| `/accounts` | GET | Sí (cualquier rol) | Lista todas las cuentas activas |
| `/accounts/{id}` | GET | Sí | Detalle de una cuenta |
| `/performance/{login}` | GET | Sí | Equity curve histórica (últimos 500 por defecto) |

### 6.4 Alertas

| Endpoint | Método | Auth | Descripción |
|----------|--------|------|-------------|
| `/alerts` | GET | Sí | Lista alertas (filtro `acknowledged`) |
| `/alerts/{id}/ack` | POST | Sí | Marcar alerta como leída |

### 6.5 Acciones (solo dev)

| Endpoint | Método | Auth | Descripción |
|----------|--------|------|-------------|
| `/close-position` | POST | Sí (rol `dev`) | Cerrar posición remota |

---

## 7. Troubleshooting

### 7.1 Backend no arranca: `Address already in use`

- Puerto 8000 ocupado: cambiar `BACKEND_PORT` en `.env` o liberar puerto.

### 7.2 Frontend no conecta a API

- Verificar `VITE_API_URL` en frontend `.env.local`.
- En desarrollo, Vite proxy en `vite.config.ts` reescribe `/api` a `http://localhost:8000`.

### 7.3 WebSocket desconecta

- Nginx config requiere `Upgrade` headers (ya configurado en `nginx.conf`).
- Si detrás de proxy inverso, asegurar `proxy_set_header Upgrade $http_upgrade;` y `Connection "upgrade"`.

### 7.4 Alertas email no llegan

- `ALERT_EMAIL_ENABLED=true` en `.env`.
- Verificar credenciales SMTP (Gmail requiere App Password).
- Revisar logs backend: `docker-compose logs backend`.

### 7.5 Cuentas no aparecen

- Bot debe enviar telemetría a `/api/v1/telemetry` al menos una vez.
- Verificar connectivity desde VPS: `curl -X POST http://<dashboard>/api/v1/telemetry -d '{"broker":"test","login":"1","balance":1,"equity":1,"drawdown_pct":0,"positions":[]}'`.
- Chequear logs backend: `docker-compose logs backend | grep telemetry`.

---

## 8. Estructura del proyecto

```
mt5-dashboard/
├── backend/
│   ├── main.py                 # FastAPI app
│   ├── requirements.txt
│   ├── Dockerfile
│   └── test_api.py             # pytest suite
├── frontend/
│   ├── src/
│   │   ├── components/         # UI reusable
│   │   ├── pages/              # Vistas (Dashboard, Team, Dev, Analytics)
│   │   ├── hooks/              # custom hooks (WebSocket, queries)
│   │   ├── services/           # API client
│   │   ├── types/              # TypeScript interfaces
│   │   └── utils/              # helpers (métricas financieras)
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml
├── nginx.conf
├── .env.example
└── README.md
```

---

## 9. Roadmap (futuro)

- [ ] Bonferroni correction en StatValidator del motor QuantFib.
- [ ] Activar `MathTraceTrail` en producción (flag `audit_with_hash_chain`).
- [ ] Reentrenar RF de regímenes con datos 2024-2026.
- [ ] Fix detector flash events (filtro `|log_ret| > 1e-5`).
- [ ] Página de configuración de alertas (umbrales personalizados por cuenta).
- [ ] Exportación de datos históricos (CSV/Excel).
- [ ] Soporte multi-idioma (i18n).

---

**Última actualización**: 2026-05-02  
**Versión**: 2.0.0  
**Licencia**: Propietaria — Uso interno


---

## Arquitectura

```text
[VPS #1]
  MT5 + EA Exporter -> status.json (HTTP/HTTPS)

[VPS #2]
  MT5 + EA Exporter -> status.json (HTTP/HTTPS)

                ↓ polling (backend local)

[Local Docker Host]
  - postgres
  - backend (FastAPI)
  - frontend (React)
  - nginx (reverse proxy)
```

---

## 1) Variables de entorno (.env) — sin hardcode

Se eliminó hardcode de puertos/credenciales en `docker-compose.yml`.

### 1.1 Crear archivo `.env`

En raíz del proyecto:

```bash
cd mt5-dashboard
cp .env.example .env
```

Si estás en Windows PowerShell sin `cp`:
```powershell
Copy-Item .env.example .env
```

### 1.2 Completar `.env`

Ejemplo mínimo:

```env
POSTGRES_DB=mt5_dashboard
POSTGRES_USER=dashboard
POSTGRES_PASSWORD=CAMBIA_ESTA_PASSWORD
POSTGRES_PORT=5433

BACKEND_PORT=8000
SECRET_KEY=CAMBIA_ESTA_SECRET_KEY_LARGA
SESSION_TIMEOUT_MIN=30

VPS_ENDPOINTS=https://IP_VPS_1:8443/status.json,https://IP_VPS_2:8443/status.json

FRONTEND_PORT=3001
VITE_API_URL=http://localhost:8000

NGINX_HTTP_PORT=80
NGINX_HTTPS_PORT=443
```

> Recomendación: usa una `SECRET_KEY` larga y aleatoria (mínimo 64 chars).

---

## 2) Docker Compose parametrizado por .env

Archivo actualizado: `docker-compose.yml`

- Postgres usa `${POSTGRES_*}`
- Backend usa `${BACKEND_PORT}`, `${SECRET_KEY}`, `${VPS_ENDPOINTS}`
- Frontend usa `${FRONTEND_PORT}` y `${VITE_API_URL}`
- Nginx usa `${NGINX_HTTP_PORT}`, `${NGINX_HTTPS_PORT}`

Esto evita valores quemados y simplifica despliegues por entorno.

---

## 3) Levantar stack local (paso a paso)

### 3.1 Detener stack previo
```bash
docker-compose down --remove-orphans
```

### 3.2 Levantar con rebuild
```bash
docker-compose up -d --build --force-recreate
```

### 3.3 Ver estado
```bash
docker-compose ps
```

Servicios esperados:
- postgres: healthy
- backend: up
- frontend: up
- nginx: up

### 3.4 Puertos esperados (según `.env`)
- Frontend directo: `http://localhost:${FRONTEND_PORT}`
- Backend API: `http://localhost:${BACKEND_PORT}`
- Postgres host: `${POSTGRES_PORT}`
- Nginx: `http://localhost:${NGINX_HTTP_PORT}`

---

## 4) Integración con VPS (IP/puertos) — guía operativa

## 4.1 En cada VPS MT5

Implementar uno de estos métodos:

1. **EA MQL5 Exporter** escribe JSON a carpeta servida por web server.
2. Servicio auxiliar Python/Node expone endpoint `/status.json` con token.

## 4.2 Endpoint recomendado

Por VPS, exponer:

```text
https://<IP_O_DNS_VPS>:8443/status.json
```

## 4.3 Firewall / seguridad

Abrir solo lo necesario:

- Puerto API del exporter (ej. 8443/tcp)
- Restringir por allowlist a IP de tu dashboard local
- TLS obligatorio (cert válido o interno)
- Token Bearer/HMAC para autenticar requests

## 4.4 Registrar endpoints en `.env`

```env
VPS_ENDPOINTS=https://IP_VPS_1:8443/status.json,https://IP_VPS_2:8443/status.json
```

Para escalar a más VPS/cuentas, agrega más URLs separadas por coma.

---

## 5) Formato sugerido de `status.json` por VPS

```json
{
  "vps_id": "vps-01",
  "timestamp_utc": "2026-05-01T12:00:00Z",
  "accounts": [
    {
      "account_id": "123456",
      "broker": "BrokerX",
      "balance": 10000.0,
      "equity": 10250.5,
      "margin": 1200.0,
      "free_margin": 9050.5,
      "drawdown_pct": 2.3,
      "positions": [
        {
          "ticket": 123,
          "symbol": "XAUUSD",
          "type": "BUY",
          "volume": 0.1,
          "open_price": 2300.0,
          "sl": 2288.0,
          "tp": 2320.0,
          "profit": 125.0
        }
      ]
    }
  ]
}
```

---

## 6) Endpoints de prueba rápida (backend)

Si backend está arriba:

```bash
curl.exe -i http://localhost:8000/docs
```

Si devuelve error, revisar logs:

```bash
docker-compose logs backend --tail=200
```

---

## 7) Problemas ya resueltos durante despliegue

1. **Conflicto puerto Postgres 5432**
   - Solución: host `5433:5432`
2. **Conflicto puerto Frontend 3000**
   - Solución: host `3001:3000`
3. **Backend caído por módulo jwt**
   - Solución: agregar `PyJWT==2.9.0` en `backend/requirements.txt` y rebuild

---

## 8) Checklist de hardcode removido

- [x] Credenciales DB no hardcodeadas en compose
- [x] Puertos no hardcodeados en compose
- [x] URL API frontend vía variable `VITE_API_URL`
- [x] Endpoints VPS via `VPS_ENDPOINTS`

---

## 9) Recomendaciones de producción

- No commitear `.env` real (solo `.env.example`)
- Rotar `SECRET_KEY` y contraseñas periódicamente
- Usar vault/secret manager en lugar de `.env` para producción estricta
- Activar HTTPS end-to-end (incluyendo backend interno si aplica)
- Auditoría de acciones sensibles (close position, cambios de riesgo)

---

## 10) Archivos clave actualizados

- `mt5-dashboard/docker-compose.yml` (parametrizado con `.env`)
- `mt5-dashboard/.env.example` (plantilla de variables)
- `mt5-dashboard/backend/requirements.txt` (`PyJWT` agregado)
- `mt5-dashboard/README.md` (esta guía paso a paso)
