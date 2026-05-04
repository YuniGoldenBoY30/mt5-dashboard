# 🏛️ Arquitectura del Sistema: QuantFib VIP Ecosystem

## 1. Visión General
El sistema **QuantFib VIP** es una plataforma de monitoreo y control institucional diseñada para gestionar agentes de trading basados en Aprendizaje por Refuerzo (RL) distribuidos en múltiples VPS (nodos esclavos), centralizando la telemetría en un Dashboard Maestro (Master).

### Componentes Core:
*   **Nodos Esclavos (VPS/MT5):** Ejecutan la estrategia QuantFib y exportan datos vía HTTP POST.
*   **Backend Master (FastAPI):** Núcleo modular que procesa telemetría, gestiona la persistencia y la seguridad.
*   **Frontend VIP (React):** Interfaz de usuario de alta precisión basada en el sistema de diseño Obsidian.
*   **Base de Datos (PostgreSQL):** Almacenamiento con integridad criptográfica (Hash Chains).

## 2. Diagrama de Flujo de Datos
1.  **Exportación:** El `TelemetryExporter.mq5` recolecta métricas cada $N$ segundos.
2.  **Ingesta:** Los datos se envían al endpoint `/api/v1/telemetry` protegidos por una triple capa de seguridad (IP, X-API-KEY, Bearer).
3.  **Procesamiento:** El Backend calcula el `record_hash` basándose en el estado anterior para garantizar la inmutabilidad.
4.  **Distribución:** Los datos se envían en tiempo real al Frontend mediante **WebSockets** (`/ws/accounts`).

## 3. Modularidad (Clean Architecture)
El backend sigue una estructura de alta cohesión:
- `app/core/`: Configuración y Seguridad.
- `app/db/`: Sesiones y motor.
- `app/models/`: Entidades de persistencia.
- `app/schemas/`: Contratos de datos (Pydantic).
- `app/services/`: Lógica de negocio (Alertas, Telemetría, Auditoría).
- `app/api/v1/`: Routers desacoplados.

---
*Documentación generada para el equipo de QuantFib - Mayo 2026*
