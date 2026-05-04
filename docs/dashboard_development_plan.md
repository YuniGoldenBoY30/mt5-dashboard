# Plan de Desarrollo: MT5 Multi-Account Dashboard

Este plan define la hoja de ruta para construir, estabilizar y desplegar el dashboard local para la monitorización de múltiples cuentas MT5.

## 📌 Fase 1: Arquitectura Push Master-Esclavo (Conectividad)
**Objetivo:** Establecer una infraestructura escalable donde los VPS envían activamente los datos al servidor central, eliminando la necesidad de conocer IPs, manejar NATs o abrir puertos de entrada en cada esclavo.

*   [ ] **1.1 MQL5 Telemetry Exporter (VPS Esclavo):**
    *   Crear un Expert Advisor (EA) ligero en MQL5 que se ejecute en cada terminal.
    *   El EA leerá métricas vitales (balance, equity, posiciones abiertas, margen, drawdown).
    *   El EA enviará un payload JSON mediante una petición `HTTP POST` hacia la API pública del Dashboard Master cada *N* segundos.
*   [ ] **1.2 Endpoint Receptor (Dashboard Master):**
    *   Implementar un endpoint en FastAPI (`POST /api/telemetry`) diseñado para alta concurrencia.
    *   Validar la autenticidad del VPS esclavo mediante un API Key o Token (cada VPS tendrá sus propias credenciales).
*   [ ] **1.3 Ingestión y Persistencia:**
    *   El Backend procesará los payloads entrantes y actualizará el estado en tiempo real en PostgreSQL (tablas: `vps_nodes`, `accounts`, `positions`).
    *   Esta arquitectura Push permite añadir infinitos VPS sin necesidad de reconfigurar el Master ni de lidiar con cambios de IP en los esclavos.

## 📌 Fase 2: Motor de Streaming y APIs (Backend)
**Objetivo:** Proveer los datos de forma instantánea al frontend.

*   [ ] **2.1 Endpoints RESTful:**
    *   `GET /api/vps/status` -> Devuelve la foto actual de todas las cuentas.
    *   `GET /api/history` -> Devuelve estadísticas y rendimiento pasado (PnL histórico).
*   [ ] **2.2 WebSockets (Real-Time):**
    *   Implementar `WebSocket` endpoint en FastAPI (`/ws/live`).
    *   El endpoint receptor (`POST /api/telemetry`) emitirá eventos (broadcast) instantáneos a los clientes del dashboard cada vez que ingrese un nuevo payload con cambios de equity o posiciones.
*   [ ] **2.3 Seguridad (JWT/RBAC):**
    *   Login para administradores.
    *   Endpoints protegidos mediante token JWT.

## 📌 Fase 3: Interfaz de Usuario (Frontend React)
**Objetivo:** Crear una interfaz táctica, oscura y profesional (estilo terminal Bloomberg / institucional).

*   [ ] **3.1 Arquitectura Visual (Tailwind + Shadcn/UI o similar):**
    *   Tema oscuro por defecto.
    *   Layout tipo Dashboard: Sidebar izquierdo (Navegación VPS/Cuentas), Header (Alertas), Main Content (Widgets).
*   [ ] **3.2 Widgets de Alto Nivel (Team View):**
    *   **Global Equity Card:** Sumatoria del equity de todos los VPS.
    *   **Max Drawdown Monitor:** Alertas visuales si alguna cuenta supera el 5%, 10%, etc.
    *   **Active Positions Table:** Datatable global con todas las posiciones abiertas, filtrable por VPS o Símbolo.
*   [ ] **3.3 Vistas Específicas (Dev View):**
    *   Detalle por VPS: Uso de CPU/RAM (si se añade al `status.json`), latencia del feed.
    *   Gráficos en tiempo real: Usar `Recharts` o `TradingView Lightweight Charts` para dibujar el progreso del Equity/Balance intradía.

## 📌 Fase 4: Acciones Bidireccionales (Opcional / Fase Avanzada)
**Objetivo:** Permitir control de emergencia desde el Dashboard.

*   [ ] **4.1 Botón de Pánico (Emergency Close):**
    *   Desde el frontend, enviar un POST a `/api/emergency/close_all`.
    *   El backend envía una señal al VPS (via webhook inverso o un archivo de comandos que el EA de MQL5 lea periódicamente).
*   [ ] **4.2 Modificación de Riesgo:**
    *   Ajustar el parámetro de lotaje o encender/apagar bots de manera remota mediante señales en la base de datos o API.

## 📌 Fase 5: Estabilización y Despliegue Docker
**Objetivo:** Producción segura.

*   [ ] **5.1 Dockerización Definitiva:**
    *   Asegurar que el `docker-compose.yml` levanta toda la stack local de forma transparente.
    *   Validación de red interna Docker.
*   [ ] **5.2 Resiliencia y Monitoreo de Esclavos:**
    *   El backend ejecutará un "Watchdog" en segundo plano que verificará el timestamp (`last_seen`) de cada VPS.
    *   Si un VPS esclavo deja de hacer "Push" por más de 30 segundos, el dashboard lo marcará visualmente como "OFFLINE / STALE".

---
### Requerimientos de UI/UX a respetar
1. **Rendimiento:** Debe aguantar actualizaciones cada 1 segundo sin lag en el DOM.
2. **Claridad de Riesgo:** El Drawdown debe ser el dato más visual (colores semáforo: Verde < 5%, Amarillo > 5%, Rojo > 15%).
