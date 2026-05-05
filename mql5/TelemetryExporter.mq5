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
input string   InpVpsId        = "vps-01";                                         // Identificador unico del VPS (temporalmente no usado para deduplicación de .ex5; se mantiene para futura lógica)
input int      InpUpdateFreq   = 2;                                                // Frecuencia de envio en segundos
input int      InpStatsLookbackDays = 30;                                          // Ventana de historial para stats (días)
input bool     InpUseHalfKelly = true;                                             // Kelly conservador (Half-Kelly)
input int      InpClosedTradesLimit = 20;                                          // Máximo de trades cerrados a enviar

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
     
   EventSetTimer(InpUpdateFreq);
   Print("TelemetryExporter iniciado. Emitiendo a: ", InpDashboardUrl);
   
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

   // Equity curve simple basada en resultado neto de deals cerrados
   double initial_balance = AccountInfoDouble(ACCOUNT_BALANCE);
   double equity_curve = initial_balance;
   double peak_equity = equity_curve;

   for(int i = 0; i < deals; i++)
     {
      ulong deal_ticket = HistoryDealGetTicket(i);
      if(deal_ticket == 0)
         continue;

      long deal_entry = (long)HistoryDealGetInteger(deal_ticket, DEAL_ENTRY);
      if(deal_entry != DEAL_ENTRY_OUT)
         continue;

      double profit = HistoryDealGetDouble(deal_ticket, DEAL_PROFIT);
      double commission = HistoryDealGetDouble(deal_ticket, DEAL_COMMISSION);
      double swap = HistoryDealGetDouble(deal_ticket, DEAL_SWAP);
      double net = profit + commission + swap;

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
      if(deal_entry != DEAL_ENTRY_OUT)
         continue;

      string symbol = HistoryDealGetString(deal_ticket, DEAL_SYMBOL);
      long deal_type = (long)HistoryDealGetInteger(deal_ticket, DEAL_TYPE);
      string type_str = (deal_type == DEAL_TYPE_BUY) ? "BUY" : (deal_type == DEAL_TYPE_SELL ? "SELL" : "OTHER");

      datetime t = (datetime)HistoryDealGetInteger(deal_ticket, DEAL_TIME);
      string close_time = TimeToString(t, TIME_DATE|TIME_MINUTES|TIME_SECONDS);
      StringReplace(close_time, ".", "-");
      StringReplace(close_time, " ", "T");
      close_time += "Z";

      double profit = HistoryDealGetDouble(deal_ticket, DEAL_PROFIT);
      double commission = HistoryDealGetDouble(deal_ticket, DEAL_COMMISSION);
      double swap = HistoryDealGetDouble(deal_ticket, DEAL_SWAP);
      double net = profit + commission + swap;

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

   double running_balance = 0;
   string bulk_json = "[";
   int count = 0;
   int sent_count = 0;

   for(int i=0; i<total_deals; i++)
     {
      ulong ticket = HistoryDealGetTicket(i);
      if(ticket <= 0) continue;

      double profit = HistoryDealGetDouble(ticket, DEAL_PROFIT);
      double comm   = HistoryDealGetDouble(ticket, DEAL_COMMISSION);
      double swap   = HistoryDealGetDouble(ticket, DEAL_SWAP);
      running_balance += (profit + comm + swap);

      datetime time_deal = (datetime)HistoryDealGetInteger(ticket, DEAL_TIME);
      string ts = TimeToString(time_deal, TIME_DATE|TIME_MINUTES|TIME_SECONDS);
      StringReplace(ts, ".", "-");
      StringReplace(ts, " ", "T");
      ts += "Z";

      if(count > 0) bulk_json += ",";
      
      bulk_json += StringFormat("{"
         "\"vps_id\":\"%s\","
         "\"timestamp_utc\":\"%s\","
         "\"accounts\":[{"
            "\"account_id\":%I64u,"
            "\"broker\":\"%s\","
            "\"login\":\"%I64u\","
            "\"server\":\"%s\","
            "\"name\":\"%s\","
            "\"balance\":%.2f,"
            "\"equity\":%.2f,"
            "\"margin\":0.0,"
            "\"drawdown_pct\":0.0,"
            "\"regime\":\"HISTORICAL\","
            "\"active_mode\":\"SYNC\","
            "\"positions\":[]"
         "}]"
      "}", AccountInfoString(ACCOUNT_SERVER), ts, AccountInfoInteger(ACCOUNT_LOGIN), AccountInfoString(ACCOUNT_COMPANY), 
          AccountInfoInteger(ACCOUNT_LOGIN), AccountInfoString(ACCOUNT_SERVER), 
          AccountInfoString(ACCOUNT_NAME), running_balance, running_balance);

      count++;

      // Enviar en bloques de 20 para no saturar WebRequest
      if(count >= 20 || i == total_deals - 1)
        {
         bulk_json += "]";
         if(SendBulkToDashboard(bulk_json))
           {
            sent_count += count;
           }
         bulk_json = "[";
         count = 0;
        }
     }

   PrintFormat("TELEMETRY: Sincronización completada. %d registros procesados.", sent_count);
   GlobalVariableSet(global_var_name, 1);
   history_synced = true;
  }

//+------------------------------------------------------------------+
//| Enviar bloque al endpoint /bulk                                  |
//+------------------------------------------------------------------+
bool SendBulkToDashboard(string json_body)
  {
   char data[];
   char result[];
   string result_headers;
   StringToCharArray(json_body, data, 0, WHOLE_ARRAY, CP_UTF8);
   
   string url = StringFormat("%s/api/v1/telemetry/bulk", InpDashboardUrl);
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
   
   string payload = StringFormat("{"
                                 "\"vps_id\":\"%s\","
                                 "\"timestamp_utc\":\"%s\","
                                 "\"accounts\":[{"
                                    "\"account_id\":%I64u,"
                                    "\"broker\":\"%s\","
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
                                 AccountInfoString(ACCOUNT_SERVER), timestamp, account_id, broker, balance, equity, margin, free_margin, margin_level, drawdown_pct,
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
