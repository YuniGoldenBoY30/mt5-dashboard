# Multi-VPS Deployment Guide — QuantFib Dashboard

> **Versión:** 2026-05-03
> **Topología:** 1 Dashboard Master (UTC+0) + N VPS (cualquier zona horaria) + N Brokers (cualquier offset).
> **Pre-requisito:** EA `TelemetryExporter.mq5 v2.0` con patrón UTC 3-timestamp.

---

## 1. Arquitectura broker-agnóstica

```
+--------------------+      +--------------------+      +-------------------------+
|  VPS-01 (Dubai)    |      |  VPS-02 (Londres)  |      |  VPS-03 (Nueva York)    |
|  TZ: UTC+4         |      |  TZ: UTC+0         |      |  TZ: UTC-5              |
|  NTP: pool.ntp.org |      |  NTP: pool.ntp.org |      |  NTP: pool.ntp.org      |
|                    |      |                    |      |                         |
|  MT5 + EA v2.0     |      |  MT5 + EA v2.0     |      |  MT5 + EA v2.0          |
|  Broker: ICMarkets |      |  Broker: Exness    |      |  Broker: OANDA          |
|  TimeTradeServer:  |      |  TimeTradeServer:  |      |  TimeTradeServer:       |
|     UTC+2 (winter) |      |     UTC+0          |      |     UTC-4 (DST)         |
|     UTC+3 (summer) |      |                    |      |                         |
+----------+---------+      +----------+---------+      +-----------+-------------+
           |                           |                            |
           |   POST telemetry payload  |                            |
           |   {                       |                            |
           |     "vps_id": "vps-XX",   |                            |
           |     "timestamp_utc":  TimeGMT()         <-- UTC real   |
           |     "broker_time":    TimeTradeServer() <-- broker     |
           |     "broker_offset_seconds": delta                     |
           |     "accounts": [...]                                  |
           |   }                                                    |
           |                                                        |
           +-----------------+-----------------------+--------------+
                             |                       |
                             v                       v
                  +----------+-----------------------+----------+
                  |       Dashboard Master (UTC+0)              |
                  |       Backend FastAPI + PostgreSQL          |
                  |  - Almacena timestamp_utc canonico          |
                  |  - Detecta NTP-skew por VPS (alerta auto)   |
                  |  - Audita broker_offset por broker          |
                  +---------------------------------------------+
```

### Garantías que ofrece este patrón

1. **Broker-agnóstico**: cualquier broker MT5 (ICMarkets UTC+2, Exness UTC+0, FTMO UTC+2 con DST, etc.) sirve sin reconfiguración del Dashboard.
2. **VPS-agnóstico**: el VPS puede estar en cualquier región del mundo; lo único requerido es **NTP funcionando**.
3. **Auditabilidad**: cada telemetry packet contiene los 3 timestamps. Si en producción aparece una incidencia, se reconstruye exactamente qué hora era en el broker, en el VPS y en el Dashboard.
4. **Detección de NTP-skew**: si el reloj de un VPS deriva, alerta automática (`event_type="ntp_skew"`).

---

## 2. Pre-flight checklist (cada VPS)

| # | Item | Comando de verificación |
|---|---|---|
| 1 | NTP sincronizado | `w32tm /query /status` (Windows) |
| 2 | NTP source válido | `w32tm /query /source` debe ser pool.ntp.org o time.windows.com |
| 3 | Skew < 60s | `w32tm /stripchart /computer:pool.ntp.org /samples:5` |
| 4 | MT5 instalado | `dir "C:\Program Files\MetaTrader 5"` |
| 5 | Python 3.12+ (si pipeline local) | `python --version` |
| 6 | WebRequest URL whitelist | MT5 → Tools → Options → Expert Advisors → URL del Dashboard |
| 7 | Firewall outbound 443 abierto | `Test-NetConnection dashboard.host -Port 443` |

**Comando one-shot para auditar** (PowerShell):
```powershell
w32tm /query /status; Test-NetConnection dashboard.host -Port 443; (Get-Date).ToUniversalTime()
```

---

## 3. Configuración del EA por VPS

Editar `InpVpsId` y `InpDashboardUrl` por cada VPS. Mantener `InpApiToken` y `InpApiKey` consistentes con la configuración del Dashboard.

| VPS | InpVpsId | InpDashboardUrl | Broker esperado | Offset esperado |
|---|---|---|---|---|
| Dubai | `vps-01-dubai` | `https://dashboard.host/api/v1/telemetry` | ICMarkets | +7200 (winter) / +10800 (summer) |
| London | `vps-02-london` | `https://dashboard.host/api/v1/telemetry` | Exness | 0 |
| New York | `vps-03-ny` | `https://dashboard.host/api/v1/telemetry` | OANDA | -14400 (DST) / -18000 (winter) |

Estos `Offset esperado` se usan para detectar **broker-spoofing**: si `broker_offset_seconds` reportado diverge >60s del esperado por más de 1 hora, el broker pudo haber cambiado de servidor.

---

## 4. Despliegue del Dashboard

### 4.1 Docker Compose (Dashboard Master)

El `mt5-dashboard/docker-compose.yml` ya está preparado. Ejecutar:

```bash
cd mt5-dashboard
docker compose up -d
docker compose logs -f backend  # verificar que arranca sin errores
```

Endpoints expuestos:
- `https://dashboard.host/api/v1/telemetry` — POST telemetry desde EAs
- `https://dashboard.host/api/v1/dashboard/*` — UI/API consultas
- `https://dashboard.host/api/v1/auth/*` — login

### 4.2 Variables de entorno críticas

`mt5-dashboard/backend/.env`:
```env
TZ=UTC                        # ← OBLIGATORIO: el contenedor del backend opera en UTC
DATABASE_URL=postgresql://...
ALERT_EMAIL_ENABLED=true
SMTP_HOST=...
ALERT_RECIPIENT_EMAILS=ops@quantfib.io
```

### 4.3 Cron de housekeeping

```cron
# Diario 04:00 UTC: limpiar alertas acknowledged > 30 días
0 4 * * * docker exec qf-backend python -c "from app.services.maintenance import cleanup_old_alerts; cleanup_old_alerts()"

# Cada 5 min: validar que cada VPS reporta (timeout: 3 min sin telemetry → alerta)
*/5 * * * * docker exec qf-backend python -c "from app.services.maintenance import check_vps_heartbeat; check_vps_heartbeat()"
```

---

## 5. Procedimiento de despliegue por VPS

### 5.1 Bootstrap inicial

```powershell
# 1. Crear directorio
New-Item -Path C:\quantfib -ItemType Directory -Force
cd C:\quantfib

# 2. Clonar config
# (sustituir credentials apropiadas en .env del backend si correrá pipeline local)

# 3. Copiar EA al directorio MT5
Copy-Item .\TelemetryExporter.mq5 -Destination "$env:APPDATA\MetaQuotes\Terminal\<TERMINAL_ID>\MQL5\Experts\"

# 4. Compilar en MetaEditor (F7)
#    Verificar 0 errors, 0 warnings

# 5. Adjuntar a un grafico XAUUSD M15 con InpVpsId correcto
```

### 5.2 Verificación post-deploy

```powershell
# Logs del EA (en MT5 Toolbox -> Experts):
# Esperado: "TelemetryExporter iniciado. Emitiendo a: https://dashboard.host/..."

# Verificar que el Dashboard recibe:
curl -H "X-API-KEY: $env:APIKEY" https://dashboard.host/api/v1/dashboard/accounts | jq '.[]| select(.server=="vps-01-dubai")'
```

### 5.3 Validación cross-VPS

Despues de desplegar los 3 VPS, ejecutar consulta:

```sql
SELECT
    server AS vps_id,
    broker,
    last_update AT TIME ZONE 'UTC' AS last_update_utc,
    status_data->>'broker_offset_seconds' AS broker_offset_secs,
    status_data->>'ntp_skew_seconds' AS ntp_skew_secs
FROM accounts
WHERE last_update > NOW() - INTERVAL '5 minutes'
ORDER BY server;
```

**Esperado:**
- 3 filas (1 por VPS).
- `last_update_utc` de los 3 dentro de ±5s.
- `broker_offset_secs` consistente con el broker configurado.
- `ntp_skew_secs` NULL (≤60s).

---

## 6. Runbook de incidentes

### 6.1 Alerta `event_type="ntp_skew"` warning (60s-5min)

**Causa probable:** NTP del VPS desincronizado o latencia de red alta.

**Acción:**
```powershell
# En el VPS afectado:
w32tm /resync /force
w32tm /query /status
# Si persiste, restart del servicio:
Stop-Service w32time; Start-Service w32time
```

### 6.2 Alerta `event_type="ntp_skew"` critical (>5min)

**Acción inmediata:** considerar **pausar trading** del VPS hasta confirmar reloj OK. Los regimenes detectados pueden ser falsos.

### 6.3 `broker_offset_seconds` cambia inesperadamente

**Causa probable:** broker movió a servidor de otra región, o cambio DST.

**Acción:** registrar el nuevo offset en la tabla `Brokers Esperados` (sección 3) y, si la diferencia es >1h, investigar.

### 6.4 Telemetry stops (heartbeat timeout)

```bash
# Verificar VPS reachable:
ping vps-01.host

# Verificar EA running en MT5:
# (RDP al VPS, mirar Toolbox -> Experts)

# Verificar URL whitelist:
# Tools -> Options -> Expert Advisors -> URL List
```

---

## 7. Rollback del EA v2.0 → v1.x

Si por alguna razón el EA v2.0 falla, se puede revertir. El backend es **backwards compatible**: los campos `broker_time` y `broker_offset_seconds` son `Optional`, por lo que un payload v1.x sin esos campos sigue siendo válido.

```powershell
# Restaurar EA v1.x desde backup
Copy-Item .\backup\TelemetryExporter_v1.mq5 -Destination "$env:APPDATA\MetaQuotes\Terminal\<TERMINAL_ID>\MQL5\Experts\TelemetryExporter.mq5" -Force
# Recompilar en MetaEditor (F7)
```

**Nota:** sin v2.0, el sistema vuelve a tener el bug A (timestamp etiquetado UTC pero es broker time). El backend lo aceptará pero los timestamps cross-VPS serán inconsistentes. Sólo aceptable como medida temporal.

---

## 8. Métricas a monitorear (Dashboard)

| Métrica | Threshold | Acción |
|---|---|---|
| `last_update` por VPS | < 3 min | Si excede: alerta heartbeat_lost |
| `broker_offset_seconds` | igual al esperado ± 60s | Si diverge: alerta broker_change |
| `ntp_skew_seconds` | < 60s | Si excede: alerta ntp_skew |
| `equity` por cuenta | sin caída > 10% en 1h | Si excede: alerta equity_crash |
| `n_positions` total cluster | < 30 simultáneas | Si excede: alerta exposure_overflow |

---

## 9. Test E2E del cluster (post-deploy)

```bash
# Ejecutar desde el Dashboard Master
docker exec qf-backend python -c "
from app.db.session import SessionLocal
from app.models.models import Account
from datetime import datetime, timezone, timedelta

db = SessionLocal()
threshold = datetime.now(timezone.utc) - timedelta(minutes=3)
active = db.query(Account).filter(Account.last_update > threshold).count()
print(f'VPS activos en últimos 3min: {active}')
assert active == 3, f'Se esperaban 3 VPS, encontrados {active}'

# Validar offsets
for acc in db.query(Account).filter(Account.last_update > threshold):
    offset = acc.status_data.get('broker_offset_seconds')
    skew = acc.status_data.get('ntp_skew_seconds')
    print(f'  {acc.server} broker={acc.broker} offset={offset}s skew={skew}s')
"
```

**Resultado esperado:**
```
VPS activos en últimos 3min: 3
  vps-01-dubai broker=ICMarkets offset=7200s skew=None
  vps-02-london broker=Exness offset=0s skew=None
  vps-03-ny broker=OANDA offset=-14400s skew=None
```

---

## 10. Próximos pasos (post-despliegue inicial)

1. **Activar `MathTraceTrail`** para auditoría forense (`CFG["audit_with_hash_chain"] = True`).
2. **Walk-forward retrain del RF** cada 6 meses (cron job).
3. **Walk-forward retrain del PPO** cada 3 meses (cron job, después del RF).
4. **Capacity plan**: monitor latencia HTTP para escalar a 5+ VPS si añades cuentas.

---

> _Generado: 2026-05-03_
> _Compatible con: TelemetryExporter.mq5 v2.0 + backend schemas v3.0 + telemetry.py con NTP-skew_
