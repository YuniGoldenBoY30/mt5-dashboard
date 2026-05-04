//+------------------------------------------------------------------+
//|               AMS_NY_MultiAsset_v1.mq5                           |
//|      EA Sesion Nueva York — Opening Range + Liquidity Sweep      |
//|      Multi-Activo: XAUUSD, XAGUSD, US500, US30, EURUSD, GBPUSD  |
//|                                                                  |
//|  LOGICA CENTRAL (extraida de los videos):                        |
//|    1. Marcar High/Low de la primera vela M5 de NY (9:30 ET)      |
//|    2. Marcar PDH/PDL (High/Low del dia anterior)                 |
//|    3. Esperar sweep del OR-High, OR-Low, PDH o PDL               |
//|    4. Confirmar con vela envolvente (engulfing) en M1            |
//|    5. Entrar en direccion opuesta al sweep                       |
//|    6. Stop bajo/sobre el extremo del sweep                       |
//|    7. TP en PDH/PDL opuesto o extension de ATR                   |
//|                                                                  |
//|  JunZi Trading System  |  MQL5 MT5  |  v1.0                     |
//+------------------------------------------------------------------+
#property copyright "JunZi Trading System"
#property link      "https://www.mql5.com"
#property version   "2.00"
#property strict

#include <Trade\Trade.mqh>
#include <Trade\PositionInfo.mqh>

//+------------------------------------------------------------------+
//|  ENUMERACIONES                                                    |
//+------------------------------------------------------------------+
enum ENUM_STRATEGY_TYPE
{
   STRATEGY_NY_OR      = 1,    // Original NY Opening Range Sweep
   STRATEGY_ICT_FIB    = 2,    // Golden Pocket 61.8-65% + OTE 70.5%
   STRATEGY_VOL_PROFILE= 4,    // POC/VAH/VAL breaks
   STRATEGY_MULTI_TF   = 8,    // EMA bias H4/D1 + M1 fractal
   STRATEGY_QUANTFIB   = 16    // ADX/DI+ dominance (skill-inspired)
};

enum ENUM_SWEEP_TYPE
{
   SWEEP_NONE      = 0,
   SWEEP_HIGH      = 1,   // Barrido del High → SHORT
   SWEEP_LOW       = -1   // Barrido del Low  → LONG
};

//+------------------------------------------------------------------+
//|  ESTRUCTURA POR SIMBOLO                                           |
//+------------------------------------------------------------------+
struct AssetState
{
   string   symbol;
   bool     active;          // Operable en esta sesion
   double   OR_High;         // Opening Range High (primera vela M5 NY)
   double   OR_Low;          // Opening Range Low
   double   PDH;             // Previous Day High
   double   PDL;             // Previous Day Low
   double   ATR;             // ATR M5 actual
   bool     OR_Formed;       // Primera vela M5 ya cerrada
   bool     Traded;          // Ya se opero este asset hoy
   datetime OR_Time;         // Tiempo de la primera vela M5
   ENUM_SWEEP_TYPE last_sweep;
};

//+------------------------------------------------------------------+
//|  INPUTS                                                           |
//+------------------------------------------------------------------+
input group "=== ACTIVOS A OPERAR ==="
input bool   Trade_XAUUSD   = true;   // Oro (XAUUSD)
input bool   Trade_XAGUSD   = false;  // Plata (XAGUSD)
input bool   Trade_US500    = true;   // S&P 500 (US500)
input bool   Trade_US30     = true;   // Dow Jones (US30)
input bool   Trade_EURUSD   = true;   // Euro/USD
input bool   Trade_GBPUSD   = true;   // Libra/USD
input bool   Trade_USTECH   = false;  // Nasdaq (USTECH/NAS100)
input bool   Trade_USDX    = false;  // Dollar Index (USDX/DXY)

input group "=== MULTI-STRATEGY SELECTOR ==="
input int    ActiveStrategies = 1;     // Bitmask: 1=NY_OR, 2=ICT_FIB, 4=VP, 8=MTF, 16=QF (ej: 31=all)
// Sufijos de broker (dejar en blanco si no hay sufijo)
input string Symbol_Suffix  = "+";    // Sufijo del broker ej: "_r" o "+"

input group "=== SESION NY ==="
input int    NY_Open_Hour   = 13;     // Hora apertura NY en UTC (13:30 = 9:30 ET)
input int    NY_Open_Min    = 30;
input int    NY_Close_Hour  = 20;     // Hora cierre operaciones (UTC)
input int    NY_Close_Min   = 0;
input int    OR_Minutes     = 5;      // Duracion Opening Range (minutos)
input int    Max_Trade_Hour = 16;     // No abrir trades despues de esta hora UTC

input group "=== FILTROS COMUNES (TODAS ESTRATEGIAS) ==="
input bool   Use_OR_Levels  = true;   // Usar H/L primera vela M5 (NY_OR)
input bool   Use_PDH_PDL    = true;   // Usar High/Low dia anterior
input double Sweep_Pips     = 3.0;    // Pips minimos de sweep (NY_OR)
input bool   Need_Engulf_M1 = true;   // Requerir engulfing en M1
input double Engulf_MinBody = 0.6;    // Cuerpo minimo engulfing (% del cuerpo previo)
input int    Confluence_Min = 2;      // Minimo confluencias por estrategia
input int    Vote_Min       = 2;      // Minimo estrategias de acuerdo para trade
input double ATR_Min_Range  = 0.5;    // ATR minimo (filtrar dias flat)

input group "=== ICT FIBONACCI (Strategy 2) ==="
input double Fib_GoldenLow  = 0.618;  // Golden Pocket bajo
input double Fib_GoldenHigh = 0.65;   // Golden Pocket alto
input double Fib_OTE_High   = 0.786;  // OTE ICT alto

input group "=== GESTION DE RIESGO ==="
input double Risk_Pct       = 0.8;    // Riesgo por trade (% balance)
input double SL_ATR_Mult    = 1.0;    // SL = 1.0x ATR sobre el extremo del sweep
input double TP1_RR         = 1.5;    // TP1 R:R
input double TP2_RR         = 3.0;    // TP2 R:R (runner)
input double TP1_Close_Pct  = 65.0;   // % lote a cerrar en TP1
input bool   UseTrail       = true;
input double Trail_ATR      = 0.8;
input double Trail_Step     = 0.25;
input double MaxSpread_Pct  = 0.05;   // Spread maximo como % del precio

input group "=== CONTROL ==="
input int    Magic          = 78001;
input string EA_Comment     = "NY_OR";
input int    MaxTrades_Total= 4;      // Max trades simultaneos en todos los activos
input bool   TradeEnabled   = true;
input bool   OneTrade_Asset = true;   // Solo 1 trade por activo por dia

//+------------------------------------------------------------------+
//|  VARIABLES GLOBALES                                               |
//+------------------------------------------------------------------+
CTrade        Trade;
CPositionInfo Pos;

AssetState    Assets[7];
int           AssetCount = 0;

datetime      LastDay     = 0;   // Control de reset diario
bool          NewsFilter  = false; // Placeholder para filtro de noticias futuro

//+------------------------------------------------------------------+
//|  OBTENER BASE DEL SIMBOLO                                          |
//+------------------------------------------------------------------+
string GetBaseFromSymbol(string sym)
{
    string bases[] = {"XAUUSD", "XAGUSD", "US500", "US30", "EURUSD", "GBPUSD", "USTECH", "USDX", "DXY", "SP500", "DJ30", "US100", "NAS100"};
    for(int i = 0; i < ArraySize(bases); i++)
    {
        if(StringFind(sym, bases[i]) >= 0)
            return bases[i];
    }
    return "";
}

//+------------------------------------------------------------------+
//|  VERIFICAR SI EL BASE ESTA HABILITADO                             |
//+------------------------------------------------------------------+
bool IsTradeEnabled(string base)
{
    if(base == "XAUUSD") return Trade_XAUUSD;
    if(base == "XAGUSD") return Trade_XAGUSD;
    if(base == "US500" || base == "SP500")   return Trade_US500;
    if(base == "US30" || base == "DJ30")     return Trade_US30;
    if(base == "EURUSD") return Trade_EURUSD;
    if(base == "GBPUSD") return Trade_GBPUSD;
    if(base == "USTECH" || base == "US100" || base == "NAS100") return Trade_USTECH;
    if(base == "USDX" || base == "DXY")      return Trade_USDX;
    return false;
}

//+------------------------------------------------------------------+
//|  OBTENER SIMBOLO PARA BASE                                         |
//+------------------------------------------------------------------+
string GetSymbolForBase(string base)
{
    // Buscar en todos los simbolos disponibles en el broker
    int total = SymbolsTotal(false);
    for(int i = 0; i < total; i++)
    {
        string sym = SymbolName(i, false);
        // Si el simbolo contiene la base
        if(StringFind(sym, base) >= 0)
        {
            if(SymbolSelect(sym, true) && SymbolInfoInteger(sym, SYMBOL_TRADE_MODE) != SYMBOL_TRADE_MODE_DISABLED)
            {
                PrintFormat("Simbolo encontrado para %s: %s", base, sym);
                return sym;
            }
        }
    }

    // Si no encontrado, intentar sufijos comunes como respaldo
    string suffixes[] = {"+", "_r", "_", "r", "", ".cash", "cash"};
    for(int s = 0; s < ArraySize(suffixes); s++)
    {
        string full = base + suffixes[s];
        if(SymbolSelect(full, true) && SymbolInfoInteger(full, SYMBOL_TRADE_MODE) != SYMBOL_TRADE_MODE_DISABLED)
        {
            PrintFormat("Simbolo encontrado con sufijo para %s: %s", base, full);
            return full;
        }
    }

    PrintFormat("No se encontro simbolo habilitado para %s", base);
    return ""; // no encontrado
}

//+------------------------------------------------------------------+
//|  OnInit                                                           |
//+------------------------------------------------------------------+
int OnInit()
{
    Trade.SetExpertMagicNumber(Magic);
    Trade.SetDeviationInPoints(30);
    Trade.SetTypeFilling(ORDER_FILLING_IOC);
    Trade.LogLevel(LOG_LEVEL_ERRORS);

    // Obtener el simbolo del grafico actual
    string current_sym = Symbol();
    string base = GetBaseFromSymbol(current_sym);

    if(base == "" || !IsTradeEnabled(base))
    {
        PrintFormat("ERROR: EA no habilitado para este simbolo %s (base: %s). Verifique las configuraciones de activos.", current_sym, base);
        return INIT_FAILED;
    }

    // Configurar para operar solo en este activo
    AssetCount = 1;
    Assets[0].symbol    = current_sym;
    Assets[0].active    = true;
    Assets[0].OR_Formed = false;
    Assets[0].Traded    = false;
    Assets[0].OR_High   = 0;
    Assets[0].OR_Low    = 0;
    Assets[0].PDH       = 0;
    Assets[0].PDL       = 0;
    Assets[0].ATR       = 0;
    Assets[0].last_sweep= SWEEP_NONE;

    // Abrir graficos para otros activos habilitados
    string all_bases[] = {"XAUUSD", "XAGUSD", "US500", "US30", "EURUSD", "GBPUSD", "USTECH", "USDX"};
    for(int i = 0; i < ArraySize(all_bases); i++)
    {
        if(IsTradeEnabled(all_bases[i]) && all_bases[i] != base)
        {
            string sym_other = GetSymbolForBase(all_bases[i]);
            if(sym_other != "")
            {
                long chart_id = ChartOpen(sym_other, PERIOD_M5);
                if(chart_id > 0)
                    PrintFormat("Grafico abierto para %s (ID: %d) - Adjunte el EA para activar operaciones", sym_other, chart_id);
                else
                    PrintFormat("Error al abrir grafico para %s", sym_other);
            }
        }
    }

    PrintFormat("AMS_NY_MultiAsset v1 iniciado en %s | Magic: %d", current_sym, Magic);

    return INIT_SUCCEEDED;
}

//+------------------------------------------------------------------+
//|  OnDeinit                                                         |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   Print("AMS_NY_MultiAsset desactivado. Razon: ", reason);
}

//+------------------------------------------------------------------+
//|  OnTick — Ejecutar en cada tick                                   |
//+------------------------------------------------------------------+
void OnTick()
{
   // Reset diario
   MqlDateTime dt; TimeToStruct(TimeGMT(), dt);
   datetime today_start = (datetime)(TimeGMT() - TimeGMT()%86400);
   if(today_start != LastDay)
   {
      DailyReset();
      LastDay = today_start;
   }

   // Verificar ventana de sesion NY
   int cur_min = dt.hour * 60 + dt.min;
   int ny_open = NY_Open_Hour * 60 + NY_Open_Min;
   int ny_cls  = NY_Close_Hour * 60 + NY_Close_Min;
   bool in_session = (cur_min >= ny_open && cur_min < ny_cls);
   if(!in_session) return;

   // No abrir nuevas posiciones tarde en la sesion
   bool can_open = (dt.hour < Max_Trade_Hour) && TradeEnabled;

   // Gestionar trailing de posiciones abiertas (siempre)
   ManageTrailing();

   // Procesar cada activo
   for(int i = 0; i < AssetCount; i++)
   {
      if(!Assets[i].active) continue;
      ProcessAsset(i, cur_min, ny_open, can_open);
   }
}

//+------------------------------------------------------------------+
//|  RESET DIARIO — recalcular PDH/PDL para todos los activos        |
//+------------------------------------------------------------------+
void DailyReset()
{
   for(int i = 0; i < AssetCount; i++)
   {
      Assets[i].OR_Formed  = false;
      Assets[i].Traded     = false;
      Assets[i].OR_High    = 0;
      Assets[i].OR_Low     = 0;
      Assets[i].last_sweep = SWEEP_NONE;

      // Calcular PDH/PDL (High/Low de ayer)
      MqlRates daily[];
      ArraySetAsSeries(daily, true);
      if(CopyRates(Assets[i].symbol, PERIOD_D1, 1, 2, daily) >= 2)
      {
         Assets[i].PDH = daily[1].high;  // High de ayer
         Assets[i].PDL = daily[1].low;   // Low de ayer
      }

      PrintFormat("RESET [%s] PDH=%.5f PDL=%.5f",
                  Assets[i].symbol, Assets[i].PDH, Assets[i].PDL);
   }
}

//+------------------------------------------------------------------+
//|  PROCESAR ACTIVO INDIVIDUAL                                       |
//+------------------------------------------------------------------+
void ProcessAsset(int idx, int cur_min, int ny_open, bool can_open)
{
    string sym = Assets[idx].symbol;

   // Filtros comunes
   if(!can_open) return;
   if(CountTotalPositions() >= MaxTrades_Total) return;

   double ask = SymbolInfoDouble(sym, SYMBOL_ASK);
   double bid = SymbolInfoDouble(sym, SYMBOL_BID);
   double spread = ask - bid;
   double price = (ask + bid) / 2.0;
   if(price > 0 && spread / price > MaxSpread_Pct / 100.0) return;

   // Multi-Strategy Dispatcher
   int strategy_votes_buy = 0, strategy_votes_sell = 0;
   double best_buy_score = 0, best_sell_score = 0;
   ENUM_SWEEP_TYPE best_signal = SWEEP_NONE;

   // Strategy 1: NY OR Sweep (original)
   if((ActiveStrategies & STRATEGY_NY_OR) != 0)
   {
      NY_OR_ProcessAsset(idx, cur_min, ny_open, ask, bid, strategy_votes_buy, strategy_votes_sell, best_buy_score, best_sell_score);
   }

   // Strategy 2: ICT Fibonacci Golden Pocket
   if((ActiveStrategies & STRATEGY_ICT_FIB) != 0)
   {
      double ict_score = 0.0;
      int ict_dir = ICTFibSignal(idx, bid, ask, ict_score);
      if(ict_dir > 0)
      {
         strategy_votes_buy++;
         best_buy_score = MathMax(best_buy_score, ict_score);
      }
      else if(ict_dir < 0)
      {
         strategy_votes_sell++;
         best_sell_score = MathMax(best_sell_score, ict_score);
      }
   }

   // Strategy 3: Volume Profile
   if((ActiveStrategies & STRATEGY_VOL_PROFILE) != 0)
   {
      double vp_score = 0.0;
      int vp_dir = VolProfileSignal(idx, bid, ask, vp_score);
      if(vp_dir > 0)
      {
         strategy_votes_buy++;
         best_buy_score = MathMax(best_buy_score, vp_score);
      }
      else if(vp_dir < 0)
      {
         strategy_votes_sell++;
         best_sell_score = MathMax(best_sell_score, vp_score);
      }
   }

   // Strategy 4: Multi-TF EMA Bias + M1 Trigger
   if((ActiveStrategies & STRATEGY_MULTI_TF) != 0)
   {
      double mtf_score = 0.0;
      int mtf_dir = MultiTFSignal(idx, mtf_score); // 1=BUY, -1=SELL, 0=NONE
      if(mtf_dir > 0)
      {
         strategy_votes_buy++;
         best_buy_score = MathMax(best_buy_score, mtf_score);
      }
      else if(mtf_dir < 0)
      {
         strategy_votes_sell++;
         best_sell_score = MathMax(best_sell_score, mtf_score);
      }
   }

   // Strategy 5: QuantFib ADX/DI+ dominancia
   if((ActiveStrategies & STRATEGY_QUANTFIB) != 0)
   {
      double qf_score = 0.0;
      int qf_dir = QuantFibSignal(idx, qf_score); // 1=BUY, -1=SELL, 0=NONE
      if(qf_dir > 0)
      {
         strategy_votes_buy++;
         best_buy_score = MathMax(best_buy_score, qf_score);
      }
      else if(qf_dir < 0)
      {
         strategy_votes_sell++;
         best_sell_score = MathMax(best_sell_score, qf_score);
      }
   }

   // Voting System
   if(strategy_votes_buy >= Vote_Min && best_buy_score > 0)
   {
      best_signal = SWEEP_LOW;
      OpenMultiStratTrade(idx, best_signal, bid, ask, best_buy_score, "MultiStrat BUY");
   }
   else if(strategy_votes_sell >= Vote_Min && best_sell_score > 0)
   {
      best_signal = SWEEP_HIGH;
      OpenMultiStratTrade(idx, best_signal, bid, ask, best_sell_score, "MultiStrat SELL");
   }
}

// NY OR Strategy (extracted original logic)
void NY_OR_ProcessAsset(int idx, int cur_min, int ny_open, double ask, double bid, int& votes_buy, int& votes_sell, double& best_buy_score, double& best_sell_score)
{
   string sym = Assets[idx].symbol;
   if(OneTrade_Asset && Assets[idx].Traded) return;

   // OR Formation (original code)
   int or_close_min = ny_open + OR_Minutes;
   if(!Assets[idx].OR_Formed && cur_min >= or_close_min)
   {
      datetime or_start_time = (datetime)(TimeGMT() - TimeGMT()%86400) + ny_open * 60;
      int shift = iBarShift(sym, PERIOD_M5, or_start_time, true);
      if(shift >= 0)
      {
         MqlRates or_bar[];
         if(CopyRates(sym, PERIOD_M5, shift, 1, or_bar) > 0)
         {
            Assets[idx].OR_High = or_bar[0].high;
            Assets[idx].OR_Low  = or_bar[0].low;
            Assets[idx].OR_Time = or_bar[0].time;
            Assets[idx].OR_Formed = true;
            
            int h_atr = iATR(sym, PERIOD_M5, 14);
            if(h_atr != INVALID_HANDLE)
            {
               double atr_buf[];
               if(CopyBuffer(h_atr, 0, 1, 1, atr_buf) > 0)
                  Assets[idx].ATR = atr_buf[0];
               IndicatorRelease(h_atr);
            }
         }
      }
   }

   if(!Assets[idx].OR_Formed) return;

   double or_range = Assets[idx].OR_High - Assets[idx].OR_Low;
   if(Assets[idx].ATR > 0 && or_range < Assets[idx].ATR * ATR_Min_Range) return;

   ENUM_SWEEP_TYPE sweep = DetectSweep(idx, bid, ask);
   if(sweep == SWEEP_NONE) return;

   if(Need_Engulf_M1 && !CheckEngulfM1(sym, sweep)) return;

   int conf = CalcConfluence(idx, sweep, bid, ask);
   if(conf < Confluence_Min) return;

   // Vote
   if(sweep == SWEEP_LOW) { votes_buy++; best_buy_score = MathMax(best_buy_score, (double)conf); }
   else { votes_sell++; best_sell_score = MathMax(best_sell_score, (double)conf); }
}

//+------------------------------------------------------------------+
//|  STRATEGY 2: ICT FIBONACCI GOLDEN POCKET                          |
//|  Detecta el swing M15 más reciente, traza fib, espera rechazo     |
//+------------------------------------------------------------------+
int ICTFibSignal(int idx, double bid, double ask, double &score)
{
   string sym = Assets[idx].symbol;
   score = 0.0;
   
   double highs[], lows[];
   ArraySetAsSeries(highs, true);
   ArraySetAsSeries(lows, true);
   if(CopyHigh(sym, PERIOD_M15, 1, 40, highs) < 40) return 0;
   if(CopyLow(sym, PERIOD_M15, 1, 40, lows) < 40) return 0;
   
   int highest_idx = ArrayMaximum(highs, 0, 40);
   int lowest_idx  = ArrayMinimum(lows, 0, 40);
   
   if(highest_idx < 0 || lowest_idx < 0) return 0;
   
   double swing_high = highs[highest_idx];
   double swing_low  = lows[lowest_idx];
   
   // Determinar dirección del swing más reciente (menor índice es más reciente)
   bool is_uptrend = lowest_idx > highest_idx; // Low pasó antes que High
   
   double fib_range = swing_high - swing_low;
   if(fib_range <= 0) return 0;
   
   if(is_uptrend)
   {
      // Tendencia alcista -> Buscar retroceso al Golden Pocket para COMPRA
      double gp_top = swing_high - fib_range * Fib_GoldenLow;
      double gp_bot = swing_high - fib_range * Fib_GoldenHigh;
      
      // Si el precio actual está en o rebotando en el GP
      if(ask <= gp_top && ask >= gp_bot - (Assets[idx].ATR > 0 ? Assets[idx].ATR*0.5 : 0))
      {
         score = 2.0;
         return 1; // BUY Signal
      }
   }
   else
   {
      // Tendencia bajista -> Buscar retroceso al Golden Pocket para VENTA
      double gp_top = swing_low + fib_range * Fib_GoldenHigh;
      double gp_bot = swing_low + fib_range * Fib_GoldenLow;
      
      if(bid >= gp_bot && bid <= gp_top + (Assets[idx].ATR > 0 ? Assets[idx].ATR*0.5 : 0))
      {
         score = 2.0;
         return -1; // SELL Signal
      }
   }
   
   return 0;
}

//+------------------------------------------------------------------+
//|  STRATEGY 3: VOLUME PROFILE (Simplified)                          |
//|  Detecta POC y opera rupturas de VAH/VAL en la sesión diaria      |
//+------------------------------------------------------------------+
int VolProfileSignal(int idx, double bid, double ask, double &score)
{
   string sym = Assets[idx].symbol;
   score = 0.0;
   
   MqlDateTime dt;
   TimeCurrent(dt);
   int bars_today = dt.hour + 1;
   if(bars_today < 1) bars_today = 1;
   
   double high_today[], low_today_arr[];
   ArraySetAsSeries(high_today, true);
   ArraySetAsSeries(low_today_arr, true);
   if(CopyHigh(sym, PERIOD_H1, 0, bars_today, high_today) < bars_today) return 0;
   if(CopyLow(sym, PERIOD_H1, 0, bars_today, low_today_arr) < bars_today) return 0;
   
   int h_idx = ArrayMaximum(high_today, 0, bars_today);
   int l_idx = ArrayMinimum(low_today_arr, 0, bars_today);
   if(h_idx < 0 || l_idx < 0) return 0;
   
   double daily_h = high_today[h_idx];
   double daily_l = low_today_arr[l_idx];
   
   double poc = (daily_h + daily_l) / 2.0; // Approximation for POC
   double range = daily_h - daily_l;
   double vah = poc + range * 0.34; // 68% Value Area / 2
   double val = poc - range * 0.34;
   
   MqlRates h1[];
   ArraySetAsSeries(h1, true);
   if(CopyRates(sym, PERIOD_H1, 0, 2, h1) < 2) return 0;
   
   // Si el precio actual está rompiendo VAH hacia arriba -> COMPRA
   if(ask > vah && h1[1].close <= vah)
   {
      score = 2.0;
      return 1; // BUY
   }
   
   // Si el precio actual está rompiendo VAL hacia abajo -> VENTA
   if(bid < val && h1[1].close >= val)
   {
      score = 2.0;
      return -1; // SELL
   }
   
   return 0;
}

//+------------------------------------------------------------------+
//|  STRATEGY 4: MULTI-TF EMA BIAS + M1 TRIGGER                       |
//|  BUY: Precio > EMA200 en H4 y D1 + M1 bullish trigger             |
//|  SELL: Precio < EMA200 en H4 y D1 + M1 bearish trigger            |
//+------------------------------------------------------------------+
int MultiTFSignal(int idx, double &score)
{
   string sym = Assets[idx].symbol;

   int h_ema_h4 = iMA(sym, PERIOD_H4, 200, 0, MODE_EMA, PRICE_CLOSE);
   int h_ema_d1 = iMA(sym, PERIOD_D1, 200, 0, MODE_EMA, PRICE_CLOSE);
   if(h_ema_h4 == INVALID_HANDLE || h_ema_d1 == INVALID_HANDLE) return 0;

   double ema_h4_buf[], ema_d1_buf[];
   ArraySetAsSeries(ema_h4_buf, true);
   ArraySetAsSeries(ema_d1_buf, true);

   if(CopyBuffer(h_ema_h4, 0, 1, 1, ema_h4_buf) < 1) { IndicatorRelease(h_ema_h4); IndicatorRelease(h_ema_d1); return 0; }
   if(CopyBuffer(h_ema_d1, 0, 1, 1, ema_d1_buf) < 1) { IndicatorRelease(h_ema_h4); IndicatorRelease(h_ema_d1); return 0; }

   double ema_h4 = ema_h4_buf[0];
   double ema_d1 = ema_d1_buf[0];
   IndicatorRelease(h_ema_h4);
   IndicatorRelease(h_ema_d1);

   MqlRates h4[], d1[], m1[];
   ArraySetAsSeries(h4, true);
   ArraySetAsSeries(d1, true);
   ArraySetAsSeries(m1, true);

   if(CopyRates(sym, PERIOD_H4, 0, 3, h4) < 2) return 0;
   if(CopyRates(sym, PERIOD_D1, 0, 3, d1) < 2) return 0;
   if(CopyRates(sym, PERIOD_M1, 0, 4, m1) < 3) return 0;

   bool h4_bull = (h4[1].close > ema_h4);
   bool d1_bull = (d1[1].close > ema_d1);
   bool h4_bear = (h4[1].close < ema_h4);
   bool d1_bear = (d1[1].close < ema_d1);

   bool m1_bull_trigger = (m1[1].close > m1[1].open && m1[2].close < m1[2].open && m1[1].close >= m1[2].open);
   bool m1_bear_trigger = (m1[1].close < m1[1].open && m1[2].close > m1[2].open && m1[1].close <= m1[2].open);

   score = 0.0;

   if(h4_bull) score += 1.0;
   if(d1_bull) score += 1.0;
   if(m1_bull_trigger) score += 1.0;

   if(h4_bull && d1_bull && m1_bull_trigger) return 1;

   score = 0.0;
   if(h4_bear) score += 1.0;
   if(d1_bear) score += 1.0;
   if(m1_bear_trigger) score += 1.0;

   if(h4_bear && d1_bear && m1_bear_trigger) return -1;

   score = 0.0;
   return 0;
}

//+------------------------------------------------------------------+
//|  STRATEGY 5: QUANTFIB ADX/DI                                      |
//|  BUY: ADX fuerte + DI+ > DI- + dominancia reciente               |
//|  SELL: ADX fuerte + DI- > DI+ + dominancia reciente              |
//+------------------------------------------------------------------+
int QuantFibSignal(int idx, double &score)
{
   string sym = Assets[idx].symbol;
   int adx_period = 14;
   double adx_min = 20.0;

   int h_adx = iADX(sym, PERIOD_H1, adx_period);
   if(h_adx == INVALID_HANDLE) return 0;

   double adx_buf[], di_plus_buf[], di_minus_buf[];
   ArraySetAsSeries(adx_buf, true);
   ArraySetAsSeries(di_plus_buf, true);
   ArraySetAsSeries(di_minus_buf, true);

   if(CopyBuffer(h_adx, 0, 1, 5, adx_buf) < 3) { IndicatorRelease(h_adx); return 0; }      // ADX
   if(CopyBuffer(h_adx, 1, 1, 5, di_plus_buf) < 3) { IndicatorRelease(h_adx); return 0; }  // +DI
   if(CopyBuffer(h_adx, 2, 1, 5, di_minus_buf) < 3) { IndicatorRelease(h_adx); return 0; } // -DI
   IndicatorRelease(h_adx);

   double adx = adx_buf[0];
   double di_plus = di_plus_buf[0];
   double di_minus = di_minus_buf[0];

   bool adx_strong = (adx >= adx_min);

   bool bull_dom = (di_plus > di_minus && di_plus_buf[1] > di_minus_buf[1]);
   bool bear_dom = (di_minus > di_plus && di_minus_buf[1] > di_plus_buf[1]);

   score = 0.0;
   if(adx_strong) score += 1.0;
   if(bull_dom) score += 1.0;
   if(di_plus > di_minus) score += 1.0;
   if(adx_strong && bull_dom) return 1;

   score = 0.0;
   if(adx_strong) score += 1.0;
   if(bear_dom) score += 1.0;
   if(di_minus > di_plus) score += 1.0;
   if(adx_strong && bear_dom) return -1;

   score = 0.0;
   return 0;
}

//+------------------------------------------------------------------+
//|  DETECCION DE SWEEP                                               |
//|  Sweep = precio toco el nivel, lo penetro y cerro de regreso     |
//+------------------------------------------------------------------+
ENUM_SWEEP_TYPE DetectSweep(int idx, double bid, double ask)
{
    string sym = Assets[idx].symbol;

   MqlRates m1[];
   ArraySetAsSeries(m1, true);
   if(CopyRates(sym, PERIOD_M1, 0, 5, m1) < 3) return SWEEP_NONE;

   double pt   = SymbolInfoDouble(sym, SYMBOL_POINT);
   double sweep_dist = Sweep_Pips * pt;
   int    dg   = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);

    // ── SWEEP DEL OR-HIGH → SELL ─────────────────────────────────
    if(Use_OR_Levels && Assets[idx].OR_High > 0)
    {
       bool price_swept_high = (m1[1].high >= Assets[idx].OR_High + sweep_dist);
       bool price_closed_below = (m1[1].close < Assets[idx].OR_High);
       bool current_below = (bid < Assets[idx].OR_High);

       if(price_swept_high && price_closed_below && current_below)
          return SWEEP_HIGH;
    }

    // ── SWEEP DEL OR-LOW → BUY ────────────────────────────────────
    if(Use_OR_Levels && Assets[idx].OR_Low > 0)
    {
       bool price_swept_low  = (m1[1].low <= Assets[idx].OR_Low - sweep_dist);
       bool price_closed_above = (m1[1].close > Assets[idx].OR_Low);
       bool current_above = (ask > Assets[idx].OR_Low);

       if(price_swept_low && price_closed_above && current_above)
          return SWEEP_LOW;
    }

    // ── SWEEP DEL PDH → SELL ─────────────────────────────────────
    if(Use_PDH_PDL && Assets[idx].PDH > 0)
    {
       bool pdh_swept   = (m1[1].high >= Assets[idx].PDH + sweep_dist);
       bool pdh_rejected = (m1[1].close < Assets[idx].PDH);
       bool cur_below   = (bid < Assets[idx].PDH);
       // Solo si el PDH esta cerca del OR (confluencia)
       bool near_or_high = (Assets[idx].OR_High > 0 && MathAbs(Assets[idx].PDH - Assets[idx].OR_High) < Assets[idx].ATR * 2);

       if(pdh_swept && pdh_rejected && cur_below &&
          (near_or_high || !Use_OR_Levels))
          return SWEEP_HIGH;
    }

    // ── SWEEP DEL PDL → BUY ──────────────────────────────────────
    if(Use_PDH_PDL && Assets[idx].PDL > 0)
    {
       bool pdl_swept   = (m1[1].low  <= Assets[idx].PDL - sweep_dist);
       bool pdl_rejected = (m1[1].close > Assets[idx].PDL);
       bool cur_above   = (ask > Assets[idx].PDL);
       bool near_or_low = (Assets[idx].OR_Low > 0 && MathAbs(Assets[idx].PDL - Assets[idx].OR_Low) < Assets[idx].ATR * 2);

       if(pdl_swept && pdl_rejected && cur_above &&
          (near_or_low || !Use_OR_Levels))
          return SWEEP_LOW;
    }

   return SWEEP_NONE;
}

//+------------------------------------------------------------------+
//|  CONFIRMACION ENGULFING M1                                        |
//|  Busca una vela M1 que envuelva la vela previa en la direccion   |
//|  opuesta al sweep (confirmacion de rechazo)                      |
//+------------------------------------------------------------------+
bool CheckEngulfM1(string sym, ENUM_SWEEP_TYPE sweep)
{
   MqlRates m1[];
   ArraySetAsSeries(m1, true);
   if(CopyRates(sym, PERIOD_M1, 0, 4, m1) < 3) return false;

   // m1[0] = vela actual (puede no haber cerrado)
   // m1[1] = ultima vela cerrada
   // m1[2] = penultima vela cerrada

   double body1 = MathAbs(m1[1].close - m1[1].open);  // cuerpo vela -1
   double body2 = MathAbs(m1[2].close - m1[2].open);  // cuerpo vela -2

   if(body2 == 0) return false;

   // Para SELL (sweep del High): buscar vela bajista que envuelva la alcista anterior
   if(sweep == SWEEP_HIGH)
   {
      bool prev_bullish  = (m1[2].close > m1[2].open);  // vela previa alcista
      bool curr_bearish  = (m1[1].close < m1[1].open);  // vela actual bajista
      bool curr_engulfs  = (m1[1].open  >= m1[2].close && // abre sobre el cierre previo
                            m1[1].close <= m1[2].open);   // cierra bajo la apertura previa
      bool body_ok       = (body1 >= body2 * Engulf_MinBody);

      return (prev_bullish && curr_bearish && curr_engulfs && body_ok);
   }

   // Para BUY (sweep del Low): buscar vela alcista que envuelva la bajista anterior
   if(sweep == SWEEP_LOW)
   {
      bool prev_bearish  = (m1[2].close < m1[2].open);
      bool curr_bullish  = (m1[1].close > m1[1].open);
      bool curr_engulfs  = (m1[1].open  <= m1[2].close &&
                            m1[1].close >= m1[2].open);
      bool body_ok       = (body1 >= body2 * Engulf_MinBody);

      return (prev_bearish && curr_bullish && curr_engulfs && body_ok);
   }

   return false;
}

//+------------------------------------------------------------------+
//|  CALCULO DE CONFLUENCIA                                           |
//|  Cuantos factores refuerzan la entrada                           |
//+------------------------------------------------------------------+
int CalcConfluence(int idx, ENUM_SWEEP_TYPE sweep, double bid, double ask)
{
    int conf = 0;

     // +1: OR level involucrado
     if(Use_OR_Levels && Assets[idx].OR_High > 0)
     {
        if(sweep == SWEEP_HIGH && MathAbs(bid - Assets[idx].OR_High) < Assets[idx].ATR * 1.5) conf += 1;
        if(sweep == SWEEP_LOW  && MathAbs(ask - Assets[idx].OR_Low) < Assets[idx].ATR * 1.5) conf += 1;
     }

     // +1: PDH/PDL involucrado
     if(Use_PDH_PDL)
     {
        if(sweep == SWEEP_HIGH && Assets[idx].PDH > 0 && MathAbs(bid - Assets[idx].PDH) < Assets[idx].ATR * 2) conf += 1;
        if(sweep == SWEEP_LOW  && Assets[idx].PDL > 0 && MathAbs(ask - Assets[idx].PDL) < Assets[idx].ATR * 2) conf += 1;
     }

     // +1: OR High y PDH muy cerca (doble nivel)
     if(Assets[idx].PDH > 0 && Assets[idx].OR_High > 0 && MathAbs(Assets[idx].PDH - Assets[idx].OR_High) < Assets[idx].ATR) conf += 1;
     if(Assets[idx].PDL > 0 && Assets[idx].OR_Low  > 0 && MathAbs(Assets[idx].PDL - Assets[idx].OR_Low)  < Assets[idx].ATR) conf += 1;

     // +1: Range del OR amplio (mercado con liquidez real)
     if(Assets[idx].ATR > 0 && (Assets[idx].OR_High - Assets[idx].OR_Low) > Assets[idx].ATR * 0.8) conf += 1;

    // +1: Engulfing M1 presente (ya verificado antes, suma igual)
    if(Need_Engulf_M1) conf += 1;

   return conf;
}

//+------------------------------------------------------------------+
//|  ABRIR TRADE NY                                                   |
//+------------------------------------------------------------------+
bool OpenMultiStratTrade(int idx, ENUM_SWEEP_TYPE sweep, double bid, double ask, double score, string comment)
{
    string sym = Assets[idx].symbol;
    int    dg  = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
    double pt  = SymbolInfoDouble(sym, SYMBOL_POINT);
    double atr = Assets[idx].ATR > 0 ? Assets[idx].ATR : (Assets[idx].OR_High - Assets[idx].OR_Low);
    int    conf = (int)score;

   // Calcular SL dinamico (extremo del sweep + buffer ATR)
   double sl = 0, tp1 = 0, tp2 = 0;
   double ep = 0;

   // Verificar stops_level
   long stoplev = SymbolInfoInteger(sym, SYMBOL_TRADE_STOPS_LEVEL);
   double min_dist = stoplev * pt * 1.1;
   double sl_dist  = MathMax(atr * SL_ATR_Mult, min_dist);

    if(sweep == SWEEP_HIGH)  // SELL
    {
       ep  = bid;
       sl  = NormalizeDouble(MathMax(Assets[idx].OR_High, Assets[idx].PDH > 0 ? Assets[idx].PDH : Assets[idx].OR_High)
                             + sl_dist, dg);
       double risk = sl - ep;
       tp1 = NormalizeDouble(ep - risk * TP1_RR, dg);
       tp2 = NormalizeDouble(ep - risk * TP2_RR, dg);

       // TP alternativo: PDL si esta a buen R:R
       if(Use_PDH_PDL && Assets[idx].PDL > 0 && Assets[idx].PDL < tp1)
          tp1 = NormalizeDouble(Assets[idx].PDL, dg);
    }
    else  // BUY
    {
       ep  = ask;
       sl  = NormalizeDouble(MathMin(Assets[idx].OR_Low, Assets[idx].PDL > 0 ? Assets[idx].PDL : Assets[idx].OR_Low)
                             - sl_dist, dg);
       double risk = ep - sl;
       tp1 = NormalizeDouble(ep + risk * TP1_RR, dg);
       tp2 = NormalizeDouble(ep + risk * TP2_RR, dg);

       if(Use_PDH_PDL && Assets[idx].PDH > 0 && Assets[idx].PDH > tp1)
          tp1 = NormalizeDouble(Assets[idx].PDH, dg);
    }

   // Calcular lotes
   double total_lots = CalcLots(sym, ep, sl, Risk_Pct);
   if(total_lots <= 0) return false;

   // Dividir en 2 tickets (TP1 parcial)
   double lstep = SymbolInfoDouble(sym, SYMBOL_VOLUME_STEP);
   double lmin  = SymbolInfoDouble(sym, SYMBOL_VOLUME_MIN);
   double l1    = MathMax(MathFloor(total_lots*(TP1_Close_Pct/100.0)/lstep)*lstep, lmin);
   double l2    = MathMax(MathFloor((total_lots-l1)/lstep)*lstep, lmin);
   if(l2 < lmin) { l2 = total_lots; l1 = 0; }

   string cmt = StringFormat("%s|NY|%s|C%d", EA_Comment,
                (sweep==SWEEP_HIGH?"S":"B"), conf);
   bool ok = false;

   // Ticket 1 → TP1
   if(l1 >= lmin)
   {
      if(sweep == SWEEP_HIGH) ok = Trade.Sell(l1, sym, 0, sl, tp1, cmt+"|P1");
      else                    ok = Trade.Buy (l1, sym, 0, sl, tp1, cmt+"|P1");
      if(!ok) PrintFormat("ERROR T1 [%s]: %d %s", sym,
                          Trade.ResultRetcode(), Trade.ResultRetcodeDescription());
   }

   // Ticket 2 → TP2 (runner)
   if(l2 >= lmin)
   {
      bool ok2 = false;
      if(sweep == SWEEP_HIGH) ok2 = Trade.Sell(l2, sym, 0, sl, tp2, cmt+"|P2");
      else                    ok2 = Trade.Buy (l2, sym, 0, sl, tp2, cmt+"|P2");
      if(!ok2) PrintFormat("ERROR T2 [%s]: %d %s", sym,
                           Trade.ResultRetcode(), Trade.ResultRetcodeDescription());
      ok = ok || ok2;
   }

    if(ok)
    {
       PrintFormat("TRADE ABIERTO [%s] %s | EP=%.5f SL=%.5f TP1=%.5f TP2=%.5f | Lots=%.2f | Conf=%d",
                   sym, (sweep==SWEEP_HIGH?"SELL":"BUY"),
                   ep, sl, tp1, tp2, total_lots, conf);
       Assets[idx].last_sweep = sweep;
    }
   return ok;
}

//+------------------------------------------------------------------+
//|  GESTION DE TRAILING                                              |
//+------------------------------------------------------------------+
void ManageTrailing()
{
   if(!UseTrail) return;

   for(int i = PositionsTotal()-1; i >= 0; i--)
   {
      if(!Pos.SelectByIndex(i))         continue;
      if(Pos.Magic() != Magic)          continue;

      string sym    = Pos.Symbol();
      ulong  tkt    = Pos.Ticket();
      double cur_sl = Pos.StopLoss();
      double cur_tp = Pos.TakeProfit();
      double open_p = Pos.PriceOpen();
      double bid    = SymbolInfoDouble(sym, SYMBOL_BID);
      double ask    = SymbolInfoDouble(sym, SYMBOL_ASK);
      int    dg     = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);

      // Buscar ATR del activo
      double atr = 0;
      for(int j = 0; j < AssetCount; j++)
         if(Assets[j].symbol == sym) { atr = Assets[j].ATR; break; }
      if(atr <= 0) continue;

      double trail_d = NormalizeDouble(atr * Trail_ATR, dg);
      double trail_s = NormalizeDouble(atr * Trail_Step, dg);
      double pt      = SymbolInfoDouble(sym, SYMBOL_POINT);
      long stoplev   = SymbolInfoInteger(sym, SYMBOL_TRADE_STOPS_LEVEL);
      double min_d   = stoplev * pt * 1.1;
      trail_d = MathMax(trail_d, min_d);

      if(Pos.PositionType() == POSITION_TYPE_BUY)
      {
         double new_sl = NormalizeDouble(bid - trail_d, dg);
         if(new_sl > cur_sl + trail_s && new_sl < bid)
            Trade.PositionModify(tkt, new_sl, cur_tp);
         // Break-even
         if(cur_sl < open_p && bid > open_p + atr)
         {
            double be = NormalizeDouble(open_p + trail_s, dg);
            if(be > cur_sl) Trade.PositionModify(tkt, be, cur_tp);
         }
      }
      else if(Pos.PositionType() == POSITION_TYPE_SELL)
      {
         double new_sl = NormalizeDouble(ask + trail_d, dg);
         if(new_sl < cur_sl - trail_s && new_sl > ask)
            Trade.PositionModify(tkt, new_sl, cur_tp);
         // Break-even
         if(cur_sl > open_p && ask < open_p - atr)
         {
            double be = NormalizeDouble(open_p - trail_s, dg);
            if(be < cur_sl) Trade.PositionModify(tkt, be, cur_tp);
         }
      }
   }
}

//+------------------------------------------------------------------+
//|  CALCULO DE LOTES                                                 |
//+------------------------------------------------------------------+
double CalcLots(string sym, double entry, double sl, double risk_pct)
{
   double bal  = AccountInfoDouble(ACCOUNT_BALANCE);
   double risk = bal * (risk_pct / 100.0);
   double pt   = SymbolInfoDouble(sym, SYMBOL_POINT);
   double tv   = SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_VALUE);
   double ts   = SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_SIZE);
   double lmin = SymbolInfoDouble(sym, SYMBOL_VOLUME_MIN);
   double lmax = SymbolInfoDouble(sym, SYMBOL_VOLUME_MAX);
   double lstp = SymbolInfoDouble(sym, SYMBOL_VOLUME_STEP);

   double sl_pts = MathAbs(entry - sl) / pt;
   if(sl_pts <= 0 || tv <= 0 || ts <= 0) return lmin;

   double pv   = tv / ts * pt;
   double lots = risk / (sl_pts * pv);
   lots = MathFloor(lots / lstp) * lstp;
   lots = MathMax(lots, lmin);
   lots = MathMin(lots, lmax);
   return lots;
}

//+------------------------------------------------------------------+
//|  CONTADOR DE POSICIONES TOTALES (todos los activos)               |
//+------------------------------------------------------------------+
int CountTotalPositions()
{
   int n = 0;
   for(int i = 0; i < PositionsTotal(); i++)
      if(Pos.SelectByIndex(i) && Pos.Magic() == Magic) n++;
   return n;
}
//+------------------------------------------------------------------+
//|  FIN DE AMS_NY_MultiAsset_v1.mq5                                 |
//+------------------------------------------------------------------+
