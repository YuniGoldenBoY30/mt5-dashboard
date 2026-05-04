# 🎨 QuantFib Web Dashboard - UI/UX Design System

El diseño del dashboard debe transmitir **institucionalidad, alta tecnología y claridad instantánea del riesgo**. Al estar construido con TailwindCSS y Shadcn/UI, utilizaremos un tema "Dark Mode" obligatorio (evitando la fatiga visual de los traders) con animaciones sutiles (micro-interactions) que reflejen la naturaleza "Real-Time" de los WebSockets.

A continuación, se presenta la arquitectura de la interfaz para los dos roles definidos en nuestro backend (`team` y `dev`).

---

## 1. Team View (Gestores de Riesgo / Inversores)
**Filosofía:** "Don't make me think". El inversor solo quiere saber cuánto dinero hay, si está en peligro, y qué posiciones están abiertas.

*   **Paleta de Colores:** Fondo "Deep Space" (`#0B0F19`), tarjetas en gris plomo (`#1A202C`), acentos principales en "Cyber Blue" (`#00E5FF`).
*   **Semáforo de Riesgo:** Colores vibrantes para el Drawdown (Verde `<5%`, Naranja `>5%`, Rojo Neón `>15%`).

### Wireframe Conceptual (Team)
```text
+-----------------------------------------------------------------------------------+
| 💠 QuantFib Dashboard |  Overview  |  Accounts  |  History       [👤 Team] [Logout] |
+-----------------------------------------------------------------------------------+
|  [ GLOBAL EQUITY ]    [ MAX DRAWDOWN ]    [ TOTAL PNL ]      [ WIN RATE ]         |
|  $ 1,245,300.00       2.4% (Healthy)      + $45,300.00       68.5%                |
|  [Chart_Line_Mini]    [Progress_Bar_G]    [Chart_Bar_Mini]   [Pie_Mini]           |
+-----------------------------------------------------------------------------------+
|  LIVE EQUITY CURVE (Consolidado de todas las cuentas)                             |
|  +-----------------------------------------------------------------------------+  |
|  |       / \/\         /\                                                      |  |
|  |  /\/\/     \  /\   /  \      [ Interactive Chart.js Area ]                  |  |
|  | /           \/  \ /    \                                                    |  |
|  +-----------------------------------------------------------------------------+  |
+-----------------------------------------------------------------------------------+
|  ACTIVE POSITIONS (Actualizado vía WebSocket en 0.05s)                            |
|  Ticket | VPS  | Account | Symbol | Type | Volume | Entry | SL/TP | Profit      |
|  #123   | VPS1 | 55501   | XAUUSD | BUY  | 1.00   | 2400  | 2390  | 🟩 + $120.0 |
|  #124   | VPS2 | 55502   | XAUUSD | SELL | 0.50   | 2410  | 2420  | 🟥 - $30.00 |
+-----------------------------------------------------------------------------------+
```

---

## 2. Dev View (Quants / Operadores IA)
**Filosofía:** "Full Control & Deep Telemetry". El desarrollador necesita ver las tripas del modelo de Reinforcement Learning, confirmar que la inferencia de red neuronal está funcionando y tener un Botón de Pánico.

*   **Paleta de Colores:** Fondo "Void" (`#000000`), bordes y datos técnicos en "Terminal Green" (`#00FF41`) y "Warning Orange" (`#FF9900`) para alertas de latencia.
*   **Controles:** Botones destructivos (Cerrar posiciones) protegidos por modales de confirmación con doble validación.

### Wireframe Conceptual (Dev)
```text
+-----------------------------------------------------------------------------------+
| 💠 QuantFib Dashboard |  Overview  |  RL Metrics  |  Terminal     [🛠️ Dev] [Logout] |
+-----------------------------------------------------------------------------------+
| [ SYSTEM HEALTH ]     [ RL REGIME STATE ] [ ACTIVE MODE ]    [ EMERGENCY CONTROLS ] |
| WS Latency: 45ms      Current: VOLATILE   Mode: NORMAL       [🟥 CLOSE ALL TRADES ] |
| VPS Nodes: 4/4 ON     Prob: 87.2%         Risk: 0.25%        [⏸️ DISABLE EA PUSH  ] |
+-----------------------------------------------------------------------------------+
|  NODE TELEMETRY (Detalle Técnico por Máquina)                                     |
|  VPS ID | Account | Drawdown | RL Regime | Kelly F. | N. Trades | Actions         |
|  VPS-01 | 55501   | 1.2%     | TREND_UP  | 0.15     | 4         | [Close] [Pause] |
|  VPS-02 | 55502   | 18.5% ⚠ | RANGE     | 0.00     | 12        | [Close] [Pause] |
+-----------------------------------------------------------------------------------+
|  RL MUTATION / AUDIT LOGS (Consola de Inferencia en Tiempo Real)                  |
|  > [12:05:01] VPS-01: Agent PPO executed SHORT_0.25% on XAUUSD (Prob: 0.82)       |
|  > [12:05:03] VPS-02: Drawdown breach (18.5%). Active_Mode shifted to GUARD.      |
|  > [12:06:10] Master: Pushed ACTIVATE_BE to Ticket #123 via WebSocket.            |
+-----------------------------------------------------------------------------------+
```

---

## 🛠️ Tecnologías Frontend a utilizar:
1. **React + Vite:** Para compilación rápida y rendimiento.
2. **TailwindCSS:** Para crear interfaces personalizadas oscuras ("Dark Mode") sin sobrecargar archivos CSS.
3. **Lucide-React:** Para iconos profesionales y minimalistas.
4. **Recharts / Lightweight Charts:** Gráficos financieros nativos en Canvas para dibujar la `Equity Curve` sin lag visual, incluso si hay miles de puntos.
5. **Framer Motion:** Para añadir micro-animaciones (ej. cuando una posición pasa de negativo a positivo, el color flashea suavemente en verde, dando sensación de "sistema vivo").
