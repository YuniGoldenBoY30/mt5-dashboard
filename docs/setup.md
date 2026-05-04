# 🚀 Guía de Instalación y Despliegue

Instrucciones para poner en marcha el ecosistema QuantFib VIP completo.

## 1. Requisitos Previos
- Docker y Docker Compose (Recomendado).
- PostgreSQL 15+.
- Python 3.11+.
- MetaTrader 5 Terminal (en cada VPS esclavo).

## 2. Configuración del Entorno (.env)
Debe crearse un archivo `.env` en `backend/` con las siguientes variables:
```env
DATABASE_URL=postgresql://user:pass@localhost:5432/quantfib
SECRET_KEY=tu_llave_secreta_jwt
X_API_KEY=tu_llave_de_firewall_global
VPS_SECRET_TOKEN=token_para_vps
FRONTEND_URL=http://localhost:5173
ADMIN_TEAM_PASSWORD=password_para_equipo
ADMIN_DEV_PASSWORD=password_para_dev
VPS_ALLOWED_IPS=* # O lista de IPs separadas por coma
```

## 3. Configuración del EA en MetaTrader 5
1.  Copiar `TelemetryExporter.mq5` a la carpeta `Experts/` de MT5.
2.  En MT5: `Tools -> Options -> Expert Advisors`.
3.  Activar "Allow WebRequest for listed URL" y añadir la URL de tu backend.
4.  Cargar el EA en un gráfico y configurar los inputs:
    - `InpDashboardUrl`: `http://tu-ip:8000/api/v1/telemetry`
    - `InpApiKey`: El valor de `X_API_KEY` definido en el `.env`.
    - `InpApiToken`: El valor de `VPS_SECRET_TOKEN` definido en el `.env`.

## 4. Despliegue con Docker (Próximamente)
El sistema está preparado para ser orquestado mediante Docker Compose, incluyendo el backend FastAPI, el frontend Nginx y la base de datos PostgreSQL en una red aislada.

---
*QuantFib VIP Deployment Guide - Versión 3.0*
