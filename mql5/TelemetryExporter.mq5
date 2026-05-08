//+------------------------------------------------------------------+
//|                                           TelemetryExporter.mq5  |
//|                                                QuantFib Project  |
//|                                       Push Master-Slave Telemetry|
//+------------------------------------------------------------------+
#property copyright "QuantFib"
#property link      ""
#property version   "1.00"
#property description "EA to export account telemetry to Dashboard Master via HTTP POST"

//--- Input parameters
input string   InpDashboardUrl = "https://trading.zenixtech.ai/api/v1/telemetry"; // URL del Dashboard Master
input string   InpApiToken     = "snqAQ8OpesIP0p1Ur8Z-H0mk-M389qdg8c3dAX8D4OhMiXFi"; // VPS_SECRET_TOKEN (Bearer)
input string   InpApiKey       = "ZjestbIjvZj9MLzvryprX8DwC5RSk_oYJx_0Dns_yDc9Mhuf"; // X_API_KEY (Firewall)
input string   InpVpsId        = "";                                               // Identificador único del VPS (vacío = generar UUID/ID aleatorio por instancia)
// input string   InpAccountType  = "REAL";                                           // Tipo de Cuenta (REAL, DEMO) - Autodetectado
input string   InpAsset        = "";                                               // Activo Financiero (vacío = autodetectar todos los gráficos)
input string   InpBotName      = "";                                               // Nombre del Bot (vacío = autodetectar EAs)
input string   InpTimeframe    = "Intraday";                                       // Temporalidad (Intraday, o vacío para autodetectar)
input double   InpInitialBalance = 10000.0;                                        // Balance inicial manual solo como fallback si no puede detectarse del historial
input int      InpUpdateFreq   = 2;                                                // Frecuencia de envio en segundos
input int      InpStatsLookbackDays = 30;                                          // Ventana de historial para stats (días)
input bool     InpUseHalfKelly = true;                                             // Kelly conservador (Half-Kelly)
input int      InpClosedTradesLimit = 20;                                          // Máximo de trades cerrados a enviar

string g_vps_id = "";

bool        history_synced = false;
string      global_var_name;

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
  {
   // Check if WebRequest is enabled in Terminal
   if(!TerminalInfoInteger(TERMINAL_TRADE_ALLOWED))
     {
      Print("Warning: Auto trading must be allowed for Expert to function properly.");
     }
     
   // Resolver VPS ID por instancia (evita colisiones cuando se usa el mismo .ex5)
   if(StringLen(InpVpsId) > 0)
      g_vps_id = InpVpsId;
   else
     {
      MathSrand((int)(GetTickCount() + TimeLocal() + AccountInfoInteger(ACCOUNT_LOGIN)));
      int r1 = MathRand();
      int r2 = MathRand();
      g_vps_id = StringFormat("vps-%I64u-%d-%d", AccountInfoInteger(ACCOUNT_LOGIN), r1, r2);
     }

   EventSetTimer(InpUpdateFreq);
   Print("TelemetryExporter iniciado. VPS ID=", g_vps_id, ". Emitiendo a: ", InpDashboardUrl);
   
   // Nombre único para la bandera de sincronización (basado en cuenta)
   global_var_name = StringFormat("qf_sync_%I64u", AccountInfoInteger(ACCOUNT_LOGIN));
   
   return(INIT_SUCCEEDED);
  }

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
  {
   EventKillTimer();
   Print("TelemetryExporter detenido.");
  }

 //+------------------------------------------------------------------+
 //| Detectar tipo de cuenta (REAL, DEMO, CONTEST)                    |
 //+------------------------------------------------------------------+
string GetAccountType()
  {
   long trade_mode = AccountInfoInteger(ACCOUNT_TRADE_MODE);
   if(trade_mode == ACCOUNT_TRADE_MODE_DEMO)
      return "DEMO";
   if(trade_mode == ACCOUNT_TRADE_MODE_REAL)
      return "REAL";
   if(trade_mode == ACCOUNT_TRADE_MODE_CONTEST)
      return "CONTEST";
   return "UNKNOWN";
  }

//+------------------------------------------------------------------+
//| Identificar deals que afectan realmente el balance               |
//+------------------------------------------------------------------+
bool IsBalanceOperation(const long deal_type)
  {
   return (deal_type == DEAL_TYPE_BALANCE || deal_type == DEAL_TYPE_CREDIT);
  }

//+------------------------------------------------------------------+
//| Identificar cierres reales de operaciones                        |
//+------------------------------------------------------------------+
bool IsClosedTradeEntry(const long deal_entry)
  {
   return (deal_entry == DEAL_ENTRY_OUT ||
           deal_entry == DEAL_ENTRY_OUT_BY ||
           deal_entry == DEAL_ENTRY_INOUT);
  }

//+------------------------------------------------------------------+
//| Cambio neto de balance producido por un deal                     |
//+------------------------------------------------------------------+
double GetDealNetAmount(const ulong deal_ticket)
  {
   double profit = HistoryDealGetDouble(deal_ticket, DEAL_PROFIT);
   double commission = HistoryDealGetDouble(deal_ticket, DEAL_COMMISSION);
   double swap = HistoryDealGetDouble(deal_ticket, DEAL_SWAP);
   return profit + commission + swap;
  }

//+------------------------------------------------------------------+
//| Balance al inicio del historial ya seleccionado                  |
//+------------------------------------------------------------------+
double GetSelectedHistoryStartBalance()
  {
   double current_balance = AccountInfoDouble(ACCOUNT_BALANCE);
   double selected_delta = 0.0;
   int deals = HistoryDealsTotal();

   for(int i = 0; i < deals; i++)
     {
      ulong deal_ticket = HistoryDealGetTicket(i);
      if(deal_ticket == 0)
         continue;

      long deal_type = (long)HistoryDealGetInteger(deal_ticket, DEAL_TYPE);
      long deal_entry = (long)HistoryDealGetInteger(deal_ticket, DEAL_ENTRY);
      if(!IsBalanceOperation(deal_type) && !IsClosedTradeEntry(deal_entry))
         continue;

      selected_delta += GetDealNetAmount(deal_ticket);
     }

   return current_balance - selected_delta;
  }

//+------------------------------------------------------------------+
//| Detectar balance inicial real desde el historial completo        |
//+------------------------------------------------------------------+
double DetectInitialBalance(bool &has_balance_operations)
  {
   has_balance_operations = false;

   if(!HistorySelect(0, TimeCurrent()))
      return InpInitialBalance;

   int deals = HistoryDealsTotal();
   if(deals <= 0)
      return InpInitialBalance;

   double initial_funding = 0.0;
   bool saw_trade_activity = false;
   double current_balance = AccountInfoDouble(ACCOUNT_BALANCE);
   double total_delta = 0.0;

   for(int i = 0; i < deals; i++)
     {
      ulong deal_ticket = HistoryDealGetTicket(i);
      if(deal_ticket == 0)
         continue;

      long deal_type = (long)HistoryDealGetInteger(deal_ticket, DEAL_TYPE);
      long deal_entry = (long)HistoryDealGetInteger(deal_ticket, DEAL_ENTRY);
      double deal_net = GetDealNetAmount(deal_ticket);

      if(IsBalanceOperation(deal_type))
        {
         has_balance_operations = true;
         if(!saw_trade_activity)
            initial_funding += deal_net;
        }

      if(IsBalanceOperation(deal_type) || IsClosedTradeEntry(deal_entry))
         total_delta += deal_net;

      if(deal_entry == DEAL_ENTRY_IN ||
         deal_entry == DEAL_ENTRY_OUT ||
         deal_entry == DEAL_ENTRY_OUT_BY ||
         deal_entry == DEAL_ENTRY_INOUT)
         saw_trade_activity = true;
     }

   if(initial_funding > 0.0)
      return initial_funding;

   double reconstructed_balance = current_balance - total_delta;
   if(reconstructed_balance > 0.0)
      return reconstructed_balance;

   if(current_balance > 0.0)
      return current_balance;

   return InpInitialBalance;
  }

 //+------------------------------------------------------------------+
 //| Detectar EAs activos, sus símbolos y temporalidades              |
 //+------------------------------------------------------------------+
void DetectActiveBots(string &out_bots, string &out_assets, string &out_timeframes)
  {
   out_bots = "";
   out_assets = "";
   out_timeframes = "";

   long curr_chart = ChartFirst();
   int limit = 0;
   
   while(curr_chart >= 0 && limit < 100)
     {
      string expert_name = ChartGetString(curr_chart, CHART_EXPERT_NAME);
      
      // Ignorar TelemetryExporter para dar prioridad a los bots de trading
      if(StringLen(expert_name) > 0 && StringFind(expert_name, "Telemetry") < 0)
        {
         string symbol = ChartSymbol(curr_chart);
         int period = (int)ChartPeriod(curr_chart);
         string period_str = EnumToString((ENUM_TIMEFRAMES)period);
         StringReplace(period_str, "PERIOD_", "");
         
         if(StringFind(out_bots, expert_name) < 0)
           {
            if(StringLen(out_bots) > 0) out_bots += " + ";
            out_bots += expert_name;
           }
           
         if(StringFind(out_assets, symbol) < 0)
           {
            if(StringLen(out_assets) > 0) out_assets += " + ";
            out_assets += symbol;
           }
           
         if(StringFind(out_timeframes, period_str) < 0)
           {
            if(StringLen(out_timeframes) > 0) out_timeframes += " + ";
            out_timeframes += period_str;
           }
        }
      curr_chart = ChartNext(curr_chart);
      limit++;
     }
     
   // Fallbacks (Inputs manuales o chart actual si no hay otros EAs)
   if(StringLen(out_bots) == 0)
     {
      out_bots = (StringLen(InpBotName) > 0) ? InpBotName : ChartGetString(ChartID(), CHART_EXPERT_NAME);
      if(StringLen(out_bots) == 0) out_bots = "QuantFib EA";
     }
   else if(StringLen(InpBotName) > 0) out_bots = InpBotName; // Override si se forzó
     
   if(StringLen(out_assets) == 0)
     {
      out_assets = (StringLen(InpAsset) > 0) ? InpAsset : Symbol();
     }
   else if(StringLen(InpAsset) > 0) out_assets = InpAsset; // Override si se forzó
     
   if(StringLen(out_timeframes) == 0)
     {
      int period = (int)ChartPeriod(ChartID());
      string period_str = EnumToString((ENUM_TIMEFRAMES)period);
      StringReplace(period_str, "PERIOD_", "");
      
      // Si el input original no era el por defecto, respetarlo, sino usar el real del gráfico
      if(StringLen(InpTimeframe) > 0 && InpTimeframe != "Intraday" && InpTimeframe != "Scalping" && InpTimeframe != "Swing") 
         out_timeframes = InpTimeframe;
      else
         out_timeframes = period_str;
     }
  }

 //+------------------------------------------------------------------+
 //| Detectar régimen del mercado (RANGE/TREND/VOLATILE)             |
 //+------------------------------------------------------------------+
string CalculateRegime()
  {
   int atr_handle = iATR(Symbol(), PERIOD_H1, 14);
   if(atr_handle == INVALID_HANDLE)
      return "NORMAL";

   double atr_buffer[];
   ArraySetAsSeries(atr_buffer, true);
   if(CopyBuffer(atr_handle, 0, 0, 1, atr_buffer) <= 0)
     {
      IndicatorRelease(atr_handle);
      return "NORMAL";
     }

   double atr = atr_buffer[0];
   IndicatorRelease(atr_handle);

   double close_price = SymbolInfoDouble(Symbol(), SYMBOL_BID);
   if(close_price <= 0)
      return "NORMAL";

   double atr_pct = (atr / close_price) * 100.0;

   if(atr_pct > 0.8)
      return "VOLATILE";
   else if(atr_pct > 0.4)
      return "TREND";
   else
      return "RANGE";
  }

//+------------------------------------------------------------------+
//| Calcular modo adaptativo (basado en drawdown)                   |
//+------------------------------------------------------------------+
string CalculateAdaptiveMode()
  {
   double equity = AccountInfoDouble(ACCOUNT_EQUITY);
   double balance = AccountInfoDouble(ACCOUNT_BALANCE);
   double dd_pct = 0.0;

   if(balance > 0)
      dd_pct = ((balance - equity) / balance) * 100.0;

   if(dd_pct >= 10.0)
      return "PAUSE";
   else if(dd_pct >= 5.0)
      return "GUARD";
   else
      return "NORMAL";
  }

//+------------------------------------------------------------------+
//| Calcular ganancia diaria desde posiciones abiertas               |
//+------------------------------------------------------------------+
double CalculateDailyPnL()
  {
   double profit_today = 0.0;

   for(int i=0; i<PositionsTotal(); i++)
     {
      ulong ticket = PositionGetTicket(i);
      if(ticket > 0)
         profit_today += PositionGetDouble(POSITION_PROFIT);
     }

   return profit_today;
  }

//+------------------------------------------------------------------+
//| Calcular riesgo total abierto en % del equity                   |
//+------------------------------------------------------------------+
double CalculateOpenRiskPct()
  {
   double total_risk_usd = 0.0;
   double equity = AccountInfoDouble(ACCOUNT_EQUITY);

   if(equity <= 0.0)
      return 0.0;

   for(int i=0; i<PositionsTotal(); i++)
     {
      ulong ticket = PositionGetTicket(i);
      if(ticket <= 0)
         continue;

      string pos_symbol = PositionGetString(POSITION_SYMBOL);
      long   type       = PositionGetInteger(POSITION_TYPE);
      double entry      = PositionGetDouble(POSITION_PRICE_OPEN);
      double sl         = PositionGetDouble(POSITION_SL);
      double volume     = PositionGetDouble(POSITION_VOLUME);

      if(sl <= 0.0 || volume <= 0.0)
         continue;

      double tick_size  = SymbolInfoDouble(pos_symbol, SYMBOL_TRADE_TICK_SIZE);
      double tick_value = SymbolInfoDouble(pos_symbol, SYMBOL_TRADE_TICK_VALUE);

      if(tick_size <= 0.0 || tick_value <= 0.0)
         continue;

      double distance = 0.0;
      if(type == POSITION_TYPE_BUY)
         distance = entry - sl;
      else
         distance = sl - entry;

      if(distance <= 0.0)
         continue;

      double ticks = distance / tick_size;
      double risk_usd = ticks * tick_value * volume;
      if(risk_usd > 0.0)
         total_risk_usd += risk_usd;
     }

   return (total_risk_usd / equity) * 100.0;
  }

//+------------------------------------------------------------------+
//| Calcular stats de trading desde historial de deals cerrados      |
//+------------------------------------------------------------------+
void CalculateTradeStats(double &win_rate,
                         double &profit_factor,
                         double &kelly_fraction,
                         int &n_trades_cycle,
                         double &max_drawdown_pct)
  {
   win_rate = 0.0;
   profit_factor = 0.0;
   kelly_fraction = 0.0;
   n_trades_cycle = 0;
   max_drawdown_pct = 0.0;

   datetime to_time = TimeCurrent();
   datetime from_time = to_time - (InpStatsLookbackDays * 86400);

   if(!HistorySelect(from_time, to_time))
      return;

   int deals = HistoryDealsTotal();
   if(deals <= 0)
      return;

   int n_wins = 0;
   int n_losses = 0;
   double gross_win = 0.0;
   double gross_loss = 0.0;

   // Reconstruir balance al inicio de la ventana analizada
   double initial_balance = GetSelectedHistoryStartBalance();
   if(initial_balance <= 0.0)
      initial_balance = AccountInfoDouble(ACCOUNT_BALANCE);

   double equity_curve = initial_balance;
   double peak_equity = equity_curve;

   for(int i = 0; i < deals; i++)
     {
      ulong deal_ticket = HistoryDealGetTicket(i);
      if(deal_ticket == 0)
         continue;

      long deal_entry = (long)HistoryDealGetInteger(deal_ticket, DEAL_ENTRY);
      if(!IsClosedTradeEntry(deal_entry))
         continue;

      double net = GetDealNetAmount(deal_ticket);

      if(net > 0.0)
        {
         n_wins++;
         gross_win += net;
        }
      else if(net < 0.0)
        {
         n_losses++;
         gross_loss += MathAbs(net);
        }

      equity_curve += net;
      if(equity_curve > peak_equity)
         peak_equity = equity_curve;

      if(peak_equity > 0.0)
        {
         double dd = ((peak_equity - equity_curve) / peak_equity) * 100.0;
         if(dd > max_drawdown_pct)
            max_drawdown_pct = dd;
        }
     }

   int total_closed = n_wins + n_losses;
   n_trades_cycle = total_closed;

   if(total_closed <= 0)
      return;

   win_rate = (double)n_wins / (double)total_closed;

   if(gross_loss > 0.0)
      profit_factor = gross_win / gross_loss;
   else if(gross_win > 0.0)
      profit_factor = 99.0;

   if(n_wins > 0 && n_losses > 0 && gross_loss > 0.0)
     {
      double avg_win = gross_win / (double)n_wins;
      double avg_loss = gross_loss / (double)n_losses;
      if(avg_loss > 0.0)
        {
         double R = avg_win / avg_loss;
         double p = win_rate;
         double k = p - ((1.0 - p) / R);
         if(InpUseHalfKelly)
            k *= 0.5;

         if(k < 0.0) k = 0.0;
         if(k > 1.0) k = 1.0;
         kelly_fraction = k;
        }
     }
  }

//+------------------------------------------------------------------+
//| Construir JSON con últimos trades cerrados                       |
//+------------------------------------------------------------------+
string BuildClosedTradesJson(const int limit_count)
  {
   datetime to_time = TimeCurrent();
   datetime from_time = to_time - (InpStatsLookbackDays * 86400);

   if(!HistorySelect(from_time, to_time))
      return "[]";

   int deals_total = HistoryDealsTotal();
   if(deals_total <= 0)
      return "[]";

   int sent = 0;
   string json = "[";

   for(int i = deals_total - 1; i >= 0 && sent < limit_count; i--)
     {
      ulong deal_ticket = HistoryDealGetTicket(i);
      if(deal_ticket == 0)
         continue;

      long deal_entry = (long)HistoryDealGetInteger(deal_ticket, DEAL_ENTRY);
      if(!IsClosedTradeEntry(deal_entry))
         continue;

      string symbol = HistoryDealGetString(deal_ticket, DEAL_SYMBOL);
      long deal_type = (long)HistoryDealGetInteger(deal_ticket, DEAL_TYPE);
      string type_str = (deal_type == DEAL_TYPE_BUY) ? "BUY" : (deal_type == DEAL_TYPE_SELL ? "SELL" : "OTHER");

      datetime t = (datetime)HistoryDealGetInteger(deal_ticket, DEAL_TIME);
      string close_time = TimeToString(t, TIME_DATE|TIME_MINUTES|TIME_SECONDS);
      StringReplace(close_time, ".", "-");
      StringReplace(close_time, " ", "T");
      close_time += "Z";

      double net = GetDealNetAmount(deal_ticket);

      if(sent > 0)
         json += ",";

      json += StringFormat("{\"ticket\":%I64u,\"symbol\":\"%s\",\"type\":\"%s\",\"close_time_utc\":\"%s\",\"profit_net\":%.2f}",
                           deal_ticket, symbol, type_str, close_time, net);
      sent++;
     }

   json += "]";
   return json;
  }

//+------------------------------------------------------------------+
//| Timer function                                                   |
//+------------------------------------------------------------------+
void OnTimer()
  {
   if(!history_synced)
     {
      CheckAndSyncHistory();
     }
   SendTelemetry();
  }

//+------------------------------------------------------------------+
//| Sincronización histórica automática                              |
//+------------------------------------------------------------------+
void CheckAndSyncHistory()
  {
   // 1. Revisar si ya sincronizamos (usando GlobalVariable de MT5)
   if(GlobalVariableCheck(global_var_name))
     {
      history_synced = true;
      return;
     }

   Print("TELEMETRY: Iniciando sincronización histórica automática...");

   if(!HistorySelect(0, TimeCurrent())) return;
   
   int total_deals = HistoryDealsTotal();
   if(total_deals == 0)
     {
      Print("TELEMETRY: No hay deals para sincronizar.");
      GlobalVariableSet(global_var_name, 1);
      history_synced = true;
      return;
     }

   bool has_balance_operations = false;
   double actual_initial_balance = DetectInitialBalance(has_balance_operations);
   double running_balance = has_balance_operations ? 0.0 : actual_initial_balance;
   string bulk_json = "[";
   int count = 0;
   int sent_count = 0;
   bool sync_failed = false;

   for(int i=0; i<total_deals; i++)
     {
      ulong ticket = HistoryDealGetTicket(i);
      if(ticket <= 0) continue;

      long deal_type = (long)HistoryDealGetInteger(ticket, DEAL_TYPE);
      long deal_entry = (long)HistoryDealGetInteger(ticket, DEAL_ENTRY);
      if(!IsBalanceOperation(deal_type) && !IsClosedTradeEntry(deal_entry))
         continue;

      running_balance += GetDealNetAmount(ticket);

      datetime time_deal = (datetime)HistoryDealGetInteger(ticket, DEAL_TIME);
      string ts = TimeToString(time_deal, TIME_DATE|TIME_MINUTES|TIME_SECONDS);
      StringReplace(ts, ".", "-");
      StringReplace(ts, " ", "T");
      ts += "Z";

      if(count > 0) bulk_json += ",";
      
      string actual_bot_name, actual_asset, actual_timeframe;
      DetectActiveBots(actual_bot_name, actual_asset, actual_timeframe);

      bulk_json += StringFormat("{"
         "\"vps_id\":\"%s\","
         "\"timestamp_utc\":\"%s\","
         "\"accounts\":[{"
            "\"account_id\":%I64u,"
            "\"broker\":\"%s\","
            "\"login\":\"%I64u\","
            "\"server\":\"%s\","
            "\"name\":\"%s\","
            "\"account_type\":\"%s\","
            "\"asset\":\"%s\","
            "\"bot_name\":\"%s\","
            "\"timeframe\":\"%s\","
            "\"initial_balance\":%.2f,"
            "\"balance\":%.2f,"
            "\"equity\":%.2f,"
            "\"margin\":0.0,"
            "\"drawdown_pct\":0.0,"
            "\"regime\":\"HISTORICAL\","
            "\"active_mode\":\"SYNC\","
            "\"positions\":[]"
         "}]"
         "}", g_vps_id, ts, AccountInfoInteger(ACCOUNT_LOGIN), AccountInfoString(ACCOUNT_COMPANY), 
          AccountInfoInteger(ACCOUNT_LOGIN), AccountInfoString(ACCOUNT_SERVER), 
          AccountInfoString(ACCOUNT_NAME), GetAccountType(), actual_asset, 
          actual_bot_name, actual_timeframe, actual_initial_balance, running_balance, running_balance);

      count++;

      // Enviar en bloques de 20 para no saturar WebRequest
      if(count >= 20 || i == total_deals - 1)
        {
         bulk_json += "]";
         if(SendBulkToDashboard(bulk_json))
           {
            sent_count += count;
           }
         else
           {
            sync_failed = true;
           }
         bulk_json = "[";
         count = 0;
        }
     }

   if(sync_failed)
     {
      PrintFormat("TELEMETRY: Sincronización incompleta. %d registros procesados. Se reintentará en el siguiente ciclo.", sent_count);
      history_synced = false;
      return;
     }

   PrintFormat("TELEMETRY: Sincronización completada. %d registros procesados.", sent_count);
   GlobalVariableSet(global_var_name, 1);
   history_synced = true;
  }

//+------------------------------------------------------------------+
//| Enviar bloque al endpoint /bulk                                  |
//+------------------------------------------------------------------+
string BuildBulkTelemetryUrl()
  {
   string url = InpDashboardUrl;

   while(StringLen(url) > 0 && StringSubstr(url, StringLen(url) - 1, 1) == "/")
      url = StringSubstr(url, 0, StringLen(url) - 1);

   string telemetry_suffix = "/api/v1/telemetry";
   int telemetry_pos = StringFind(url, telemetry_suffix);
   if(telemetry_pos >= 0)
      return url + "/bulk";

   string api_suffix = "/api/v1";
   int api_pos = StringFind(url, api_suffix);
   if(api_pos >= 0)
      return url + "/telemetry/bulk";

   return url + "/api/v1/telemetry/bulk";
  }

bool SendBulkToDashboard(string json_body)
  {
   char data[];
   char result[];
   string result_headers;
   StringToCharArray(json_body, data, 0, WHOLE_ARRAY, CP_UTF8);
   
   string url = BuildBulkTelemetryUrl();
   string headers = StringFormat("Content-Type: application/json\r\n"
                                 "X-API-KEY: %s\r\n"
                                 "Authorization: Bearer %s\r\n", 
                                 InpApiKey, InpApiToken);

   int res = WebRequest("POST", url, headers, 10000, data, result, result_headers);
   
   if(res >= 200 && res < 300) return true;
   
   PrintFormat("TELEMETRY BULK ERROR: %d. Resp: %s", res, CharArrayToString(result));
   return false;
  }

//+------------------------------------------------------------------+
//| Main export function                                             |
//+------------------------------------------------------------------+
void SendTelemetry()
  {
   // 1. Recolectar metricas de la cuenta
   long   account_id   = AccountInfoInteger(ACCOUNT_LOGIN);
   string broker       = AccountInfoString(ACCOUNT_COMPANY);
   string server       = AccountInfoString(ACCOUNT_SERVER);
   string acc_name     = AccountInfoString(ACCOUNT_NAME);
   bool has_balance_operations = false;
   double actual_initial_balance = DetectInitialBalance(has_balance_operations);
   double balance      = AccountInfoDouble(ACCOUNT_BALANCE);
   double equity       = AccountInfoDouble(ACCOUNT_EQUITY);
   double margin       = AccountInfoDouble(ACCOUNT_MARGIN);
   double free_margin  = AccountInfoDouble(ACCOUNT_MARGIN_FREE);
   double drawdown_pct = 0.0;
   double margin_level = 0.0;
   
   if(balance > 0 && equity < balance)
     {
      drawdown_pct = ((balance - equity) / balance) * 100.0;
     }

   if(margin > 0.0)
      margin_level = (equity / margin) * 100.0;

   // Campos críticos adicionales para dashboard
   string regime = CalculateRegime();
   string active_mode = CalculateAdaptiveMode();
   double daily_pnl_usd = CalculateDailyPnL();
   double open_risk_pct = CalculateOpenRiskPct();

   // Stats de performance sobre historial de deals cerrados
   double win_rate = 0.0;
   double profit_factor = 0.0;
   double kelly_fraction = 0.0;
   int n_trades_cycle = 0;
   double max_drawdown_pct = 0.0;
   CalculateTradeStats(win_rate, profit_factor, kelly_fraction, n_trades_cycle, max_drawdown_pct);

   // Historial resumido de trades cerrados
   string closed_trades_json = BuildClosedTradesJson(InpClosedTradesLimit);

   // 2. Recolectar posiciones abiertas
   string positions_json = "[";
   int total_positions = PositionsTotal();
   for(int i=0; i<total_positions; i++)
     {
      ulong ticket = PositionGetTicket(i);
      if(ticket > 0)
        {
         string symbol = PositionGetString(POSITION_SYMBOL);
         long   type   = PositionGetInteger(POSITION_TYPE); // 0 = Buy, 1 = Sell
         double vol    = PositionGetDouble(POSITION_VOLUME);
         double open   = PositionGetDouble(POSITION_PRICE_OPEN);
         double sl     = PositionGetDouble(POSITION_SL);
         double tp     = PositionGetDouble(POSITION_TP);
         double profit = PositionGetDouble(POSITION_PROFIT);
         
         string type_str = (type == POSITION_TYPE_BUY) ? "BUY" : "SELL";
         
         if(i > 0) positions_json += ",";
         
         positions_json += StringFormat("{"
                                        "\"ticket\":%I64u,"
                                        "\"symbol\":\"%s\","
                                        "\"type\":\"%s\","
                                        "\"volume\":%.2f,"
                                        "\"open_price\":%.5f,"
                                        "\"sl\":%.5f,"
                                        "\"tp\":%.5f,"
                                        "\"profit\":%.2f"
                                        "}", ticket, symbol, type_str, vol, open, sl, tp, profit);
        }
     }
   positions_json += "]";

   // 3. Construir JSON Payload final (Normalizado a UTC)
   string timestamp = TimeToString(TimeGMT(), TIME_DATE|TIME_MINUTES|TIME_SECONDS);
   StringReplace(timestamp, ".", "-"); // Convertir YYYY.MM.DD a YYYY-MM-DD
   StringReplace(timestamp, " ", "T");
   timestamp += "Z"; // Formato ISO 8601 UTC
   
   string actual_bot_name, actual_asset, actual_timeframe;
   DetectActiveBots(actual_bot_name, actual_asset, actual_timeframe);
   
   string payload = StringFormat("{"
                                 "\"vps_id\":\"%s\","
                                 "\"timestamp_utc\":\"%s\","
                                 "\"accounts\":[{"
                                    "\"account_id\":%I64u,"
                                    "\"broker\":\"%s\","
                                    "\"server\":\"%s\","
                                    "\"name\":\"%s\","
                                    "\"account_type\":\"%s\","
                                    "\"asset\":\"%s\","
                                    "\"bot_name\":\"%s\","
                                    "\"timeframe\":\"%s\","
                                    "\"initial_balance\":%.2f,"
                                    "\"balance\":%.2f,"
                                    "\"equity\":%.2f,"
                                    "\"margin\":%.2f,"
                                    "\"free_margin\":%.2f,"
                                    "\"margin_level\":%.2f,"
                                    "\"drawdown_pct\":%.2f,"
                                    "\"regime\":\"%s\","
                                    "\"active_mode\":\"%s\","
                                    "\"daily_pnl_usd\":%.2f,"
                                    "\"open_risk_pct\":%.2f,"
                                    "\"win_rate\":%.4f,"
                                    "\"profit_factor\":%.4f,"
                                    "\"kelly_fraction\":%.4f,"
                                    "\"n_trades_cycle\":%d,"
                                    "\"max_drawdown_pct\":%.4f,"
                                    "\"closed_trades\":%s,"
                                    "\"positions\":%s"
                                 "}]"
                                 "}",
                                 g_vps_id, timestamp, account_id, broker, server, acc_name, GetAccountType(), actual_asset, actual_bot_name, actual_timeframe, actual_initial_balance, balance, equity, margin, free_margin, margin_level, drawdown_pct,
                                 regime, active_mode, daily_pnl_usd, open_risk_pct, win_rate, profit_factor, kelly_fraction,
                                 n_trades_cycle, max_drawdown_pct, closed_trades_json, positions_json);

   // 4. Preparar HTTP POST
   char post_data[];
   char result[];
   string result_headers;
   
   StringToCharArray(payload, post_data, 0, WHOLE_ARRAY, CP_UTF8);
   ArrayResize(post_data, ArraySize(post_data) - 1); // Remover null-terminator

   string headers = "Content-Type: application/json\r\n";
   headers += "X-API-KEY: " + InpApiKey + "\r\n";
   headers += "Authorization: Bearer " + InpApiToken + "\r\n";
   
   Print("DEBUG: Enviando telemetría a: ", InpDashboardUrl);
   Print("DEBUG: JSON Payload: ", payload);

   int res = WebRequest("POST", InpDashboardUrl, headers, 3000, post_data, result, result_headers);
   
   if(res == -1)
     {
      int error_code = GetLastError();
      Print("ERROR CRÍTICO: WebRequest falló. Código MT5: ", error_code);
      if (error_code == 4014) {
         Print("SOLUCIÓN: Añade ", InpDashboardUrl, " a la lista de 'WebRequest' en Tools -> Options -> Expert Advisors.");
      }
     }
   else
     {
      Print("DEBUG: Servidor respondió con código HTTP: ", res);
      string response_text = CharArrayToString(result);
      if (res >= 200 && res < 300) {
         Print("SUCCESS: Datos procesados por el Dashboard. Respuesta: ", response_text);
      } else {
         Print("WARNING: El servidor rechazó los datos (Código ", res, "). Detalle: ", response_text);
      }
     }
  }

//+------------------------------------------------------------------+
