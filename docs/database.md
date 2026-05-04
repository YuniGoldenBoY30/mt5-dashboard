# 📊 Especificación de Base de Datos e Integridad

El sistema utiliza una base de datos relacional (PostgreSQL) optimizada para series temporales y auditoría de alta frecuencia.

## 1. Esquema de Datos (Modelos Core)

### `accounts`
Almacena el estado persistente de cada cuenta MT5.
- `broker`, `login`: Llave compuesta de identificación.
- `status_data`: Último snapshot completo recibido del VPS (JSON).
- `last_update`: Marca de tiempo de la última comunicación.

### `telemetry_history` (Serie Temporal)
Historial detallado para la generación de la Equity Curve.
- `record_hash`: Firma digital del snapshot (SHA-256).
- `prev_hash`: Referencia al registro anterior (Cadena de integridad).
- `drawdown_pct`, `equity`, `balance`: Métricas críticas de riesgo.

### `alerts`
Eventos detectados por el motor de reglas (Drawdown excesivo, cambio de modo, desconexión).

### `audit_logs`
Bitácora administrativa institucional. Registra acciones como "MANUAL_CLOSE_POSITION" para cumplimiento normativo.

## 2. Estrategia de Índices
Para garantizar el rendimiento bajo carga masiva, se han implementado índices en:
- `account_login`
- `timestamp_utc`
- `record_hash`

## 3. Mecanismo de Integridad (SHA-256 Chain)
El cálculo del hash se realiza en el servidor antes de la inserción:
`hash = sha256(account_login | timestamp | equity | prev_hash)`

Este mecanismo permite la validación matemática de todo el historial de trading frente a inversores o reguladores.

---
*Diseño de datos para escalabilidad institucional*
