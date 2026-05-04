# Análisis Completo EA_multiassets.mq5 (NY OR Liquidity Sweep v1.0)

## Condiciones de Entrada al Mercado

### COMPRA (LONG) - Trigger: SWEEP_LOW
```
1. DetectSweep() retorna SWEEP_LOW:
   - m1[1].low  ≤ OR_Low/PDL - Sweep_Pips*point (default 3.0 pips)
   - m1[1].close > OR_Low/PDL (cierre por encima del nivel barrido)
   - ask actual > OR_Low/PDL (precio recuperado)

2. Confirmación Engulfing M1 (si Need_Engulf_M1=true):
   - Vela previa [m1[2]]: bajista (close < open)
   - Vela actual [m1[1]]: alcista (close > open)
   - Engulf completa: open[1] ≤ close[2] Y close[1] ≥ open[2]
   - Cuerpo[1] ≥ Cuerpo[2] * Engulf_MinBody (default 0.6)

3. Confluencia mínima (CalcConfluence() ≥ Confluence_Min=2):
   +1 OR_Low involucrado (bid cerca < ATR*1.5)
   +1 PDL involucrado (cerca < ATR*2)
   +1 OR_High/PDL confluencia (< ATR)
   +1 OR range amplio (> ATR*0.8)
   +1 Engulfing presente

→ OpenNYTrade(): BUY en ask
   SL = min(OR_Low, PDL) - ATR*SL_ATR_Mult (1.0)
   Risk = SL - entry → TP1=entry ± Risk*1.5, TP2=Risk*3.0
   Lotes = CalcLots(entry, SL, Risk_Pct=0.8%)
   Split: TP1_Close_Pct=65% → 2 tickets
```

### VENTA (SHORT) - Trigger: SWEEP_HIGH
```
1. DetectSweep() retorna SWEEP_HIGH (simétrico):
   - m1[1].high ≥ OR_High/PDH + Sweep_Pips
   - m1[1].close < OR_High/PDH
   - bid actual < OR_High/PDH

2. Engulfing bajista simétrico

3. Confluencia ≥ min (OR_High + PDH + range + engulf)

→ SELL en bid, SL=max(OR_High,PDH)+ATR*mult
```

## Condiciones de NO OPERACIÓN (Filtros Críticos)
```
❌ !in_session (cur_min < ny_open=13:30 || ≥ ny_close=20:00 UTC)
❌ !OR_Formed (primera vela M5 NY no cerrada)
❌ OneTrade_Asset && Traded (1 trade/día por activo)
❌ CountTotalPositions() ≥ MaxTrades_Total=4
❌ OR_range < ATR * ATR_Min_Range=0.5 (día flat)
❌ spread/price > MaxSpread_Pct=0.05%
❌ dt.hour ≥ Max_Trade_Hour=16 UTC (no tarde)
❌ !TradeEnabled
❌ confluence < Confluence_Min=2
```

## Gestión Post-Entrada
```
- Trailing: Si profit > ATR → BE + trail ATR*Trail_ATR=0.8 step=0.25
- Partial TP1: 65% lotes en RR1.5, resto runner RR3.0
```

## Fortalezas Actuales
- ✅ Lógica clara: sweep + rechazo + confluencia
- ✅ Multi-asset (XAU, indices, majors)
- ✅ Risk mgmt sólido (ATR dinámico, split TP)
- ✅ Filtros robustos (spread, range, horario)

## Limitaciones (Oportunidades Multi-Strat)
- Single TF (M5 OR) → falta bias H4/D1
- No Fib/ICT (Golden Pocket 61.8-65%, OTE 70.5%)
- No volume profile (POC/VAH para targets)
- NY-only → falta Asia/Londres
- No ADX/DI momentum filter

## Próximos Pasos (Multi-Strat)
1. Modularizar NY_OR como Strategy #1
2. Agregar ICT Fib Golden Pocket (Strategy #2)
3. Volume Profile breaks (Strategy #3)
4. Voting system (≥2/5 estrategias)
5. MCP backtest cada strat

**Recomendación**: Evolucionar a EA_MultiStrategies.mq5 con selector bitmask.
