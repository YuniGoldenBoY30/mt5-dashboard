# 🛡️ Protocolos de Seguridad y Blindaje

El ecosistema QuantFib VIP implementa un modelo de **Defensa en Profundidad** para proteger la integridad del capital y la confidencialidad de las estrategias.

## 1. Seguridad de Endpoints (Backend)
- **X-API-KEY Firewall:** Todas las peticiones deben incluir la cabecera `X-API-KEY`. Las peticiones sin esta llave son abortadas inmediatamente a nivel de firewall de aplicación (403 Forbidden).
- **Rate Limiting:** Protección contra ataques DDoS y de fuerza bruta. Limita el número de peticiones por IP en una ventana de 60 segundos.
- **IP Whitelisting:** El endpoint de telemetría (`/api/v1/telemetry`) valida que la IP de origen pertenezca a un nodo VPS autorizado.

## 2. Autenticación y Autorización
- **JWT (JSON Web Tokens):** Utilizados para sesiones de usuario con expiración configurable.
- **Role-Based Access Control (RBAC):** 
    - `team`: Acceso a monitoreo y analítica.
    - `dev`: Acceso a controles operacionales (cierre de posiciones) y auditoría técnica.
- **Bcrypt Hashing:** Las contraseñas nunca se almacenan en texto plano; se utiliza el algoritmo de hashing Bcrypt con sal aleatoria.

## 3. Integridad de Datos (Inmutabilidad)
- **Hash Chains:** Cada registro de telemetría (`TelemetryHistory`) contiene un hash SHA-256 que encadena el registro actual con el anterior. Cualquier alteración manual en la base de datos rompería la cadena y sería detectada por el sistema de auditoría.
- **Audit Logs:** Registro inmutable de acciones administrativas (`AuditLog`). Registra: Usuario, Acción, IP, Recurso y Timestamp.

## 4. Seguridad de Capa de Transporte
- **TLS/SSL Enforcement:** Configurado para forzar HTTPS/WSS.
- **Security Headers:** Inyección de `HSTS`, `CSP`, `X-Frame-Options` y `X-Content-Type-Options` en todas las respuestas del servidor.

---
*Estándares de seguridad de grado institucional QuantFib*
