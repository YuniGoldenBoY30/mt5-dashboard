# 🛡️ Auditoría Técnica: backend/main.py

He analizado el archivo `main.py` bajo los prismas de **Alta Cohesión**, **POO (Programación Orientada a Objetos)** y **DRY (Don't Repeat Yourself)**. A continuación, el diagnóstico y el plan de refactorización para alcanzar un grado institucional.

## 1. Análisis de Estándares

### 🟢 Fortalezas Actuales
- **POO en Modelos y Settings:** El uso de `BaseSettings` y `DeclarativeBase` es correcto y sigue las mejores prácticas de FastAPI/SQLAlchemy.
- **ConnectionManager:** Está bien encapsulado como una clase, lo que facilita el manejo de WebSockets.
- **Tipado Estricto:** Se utiliza Pydantic v2 correctamente para la validación de esquemas.

### 🔴 Debilidades (Oportunidades de Mejora)
1.  **Baja Cohesión (Monolito):** El archivo `main.py` está asumiendo demasiadas responsabilidades (Seguridad, DB, Rutas, Tareas de Fondo, Lógica de Alertas). Esto dificulta el testing y el mantenimiento.
2.  **Violación de DRY:** La lógica de "Buscar cuenta o crearla si no existe" y la de "Broadcast por WebSocket" se repite en varios puntos.
3.  **Proceduralismo en Rutas:** Las rutas contienen lógica de negocio directa. Según los estándares de **Clean Architecture**, las rutas solo deben llamar a "Servicios".
4.  **Dependencias:** Aunque `requirements.txt` está completo, se están importando librerías que podrían colisionar (ej. `PyJWT` y `python-jose` instalados simultáneamente pueden causar problemas de importación si no se gestionan bien).

---

## 2. Propuesta de Refactorización Modular

Para cumplir con la **Alta Cohesión**, propongo dividir el monolito en la siguiente estructura:

```text
backend/
├── app/
│   ├── core/           # Configuración y Seguridad (JWT, Passwords)
│   ├── db/             # Conexión a Base de Datos (SessionLocal, Engine)
│   ├── models/         # Modelos SQLAlchemy (Account, TelemetryHistory, Alert)
│   ├── schemas/        # Modelos Pydantic (Request/Response)
│   ├── services/       # Lógica de Negocio (AlertEngine, TelemetryService, EmailService)
│   ├── api/            # Routers de FastAPI (auth.py, telemetry.py, dashboard.py)
│   └── main.py         # Punto de entrada (Inicia la app e incluye los routers)
```

## 3. Auditoría de Librerías

| Librería | Estado | Acción Sugerida |
| :--- | :--- | :--- |
| `PyJWT` vs `python-jose` | ⚠️ Duplicidad | Sugiero usar solo `PyJWT` (más moderno y ligero) o `python-jose` (más completo para JWE). Actualmente usas `jwt` (PyJWT). |
| `passlib[bcrypt]` | ✅ Correcto | Esencial para el hashing de grado militar. |
| `aiosmtplib` | ✅ Correcto | Necesaria para alertas de email no bloqueantes. |
| `pydantic-settings` | ✅ Correcto | Mejor práctica para manejar el `.env`. |

---

## 4. Plan de Acción (Inmediato)

1.  **Encapsular la Lógica de Alertas:** Crear una clase `AlertService` para centralizar la creación de alertas y envío de emails.
2.  **Implementar TelemetryManager:** Una clase encargada de procesar el Push de MQL5 y el Hash Chain.
3.  **Limpieza de Imports:** Ordenar imports siguiendo PEP 8 (Librerías estándar -> Terceros -> Locales).

**¿Deseas que proceda con la "Modularización" del código para separar los modelos y routers en archivos independientes, o prefieres mantener el archivo único con un refactor interno hacia clases de servicio?**
