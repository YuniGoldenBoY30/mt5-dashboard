# Batería de Backtest Rápido de Humo — ASIA / LONDRES / Solapamientos

EA: **AMS_NY_MultiAsset_v1**  
Objetivo: validar apertura/cierre y filtros por sesión para expansión multi-sesión.

---

## 1) Configuración recomendada de sesiones (UTC)

### Escenario A — Solo ASIA (humo)
- Asia Open: **00:00**
- Asia Close: **08:00**
- OR_Minutes: 5
- Max_Trade_Hour: 6

### Escenario B — Solo LONDRES (humo)
- London Open: **08:00**
- London Close: **16:00**
- OR_Minutes: 5
- Max_Trade_Hour: 14

### Escenario C — Solapamiento ASIA→LONDRES
- Session Open: **06:00**
- Session Close: **10:00**
- OR_Minutes: 5
- Max_Trade_Hour: 9

### Escenario D — Solapamiento LONDRES→NY
- Session Open: **13:00**
- Session Close: **17:00**
- OR_Minutes: 5
- Max_Trade_Hour: 16

---

## 2) Activos para smoke test
- XAUUSD / XAUUSD+
- EURUSD
- GBPUSD
- US500 (opcional)

---

## 3) Parámetros de humo (rápidos y conservadores)
- Risk_Pct = 0.5
- Confluence_Min = 1 (para forzar verificación de flujo)
- Need_Engulf_M1 = true
- MaxTrades_Total = 2
- OneTrade_Asset = true
- ATR_Min_Range = 0.3
- MaxSpread_Pct = 0.10

---

## 4) Checklist de validación por corrida

1. **Entrada permitida dentro de ventana**
   - Sí/No: abre operaciones solo dentro de horario de sesión.
2. **No operación fuera de ventana**
   - Sí/No: no abre fuera del rango configurado.
3. **Formación OR correcta**
   - Sí/No: OR_High / OR_Low se fija al cerrar la primera M5.
4. **Sweep + confirmación**
   - Sí/No: DetectSweep + engulfing se respetan.
5. **Confluencia mínima**
   - Sí/No: bloquea entradas si conf < mínimo.
6. **Gestión de riesgo**
   - Sí/No: SL/TP/lotes válidos.
7. **Cierre y trailing**
   - Sí/No: trailing/breakeven se aplican cuando corresponde.

---

## 5) Resultado esperado de humo
- Al menos una señal válida detectada en alguno de los escenarios.
- Sin apertura fuera de horario.
- Sin errores críticos en ejecución.
- Logs consistentes con filtros y reglas.

---

## 6) Siguiente fase (después de humo)
- Endurecer filtros:
  - Confluence_Min = 2 o 3
  - ATR_Min_Range = 0.5
- Repetir batería por símbolo y periodo (3-6 meses).
- Guardar reporte por escenario para comparación NY vs ASIA vs LONDRES.
