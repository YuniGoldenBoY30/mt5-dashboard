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
input string   InpDashboardUrl = "https://trading.zenitech.ai/api/v1/telemetry"; // URL del Dashboard Master
input string   InpApiToken     = "snqAQ8OpesIP0p1Ur8Z-H0mk-M389qdg8c3dAX8D4OhMiXFi"; // VPS_SECRET_TOKEN (Bearer)
input string   InpApiKey       = "ZjestbIjvZj9MLzvryprX8DwC5RSk_oYJx_0Dns_yDc9Mhuf"; // X_API_KEY (Firewall)
input string   InpVpsId        = "vps-01";                                         // Identificador unico del VPS
input int      InpUpdateFreq   = 2;                                                // Frecuencia de envio en segundos

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
//| Timer function                                                   |
//+------------------------------------------------------------------+
void OnTimer()
  {
   SendTelemetry();
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
   
   if(balance > 0 && equity < balance)
     {
      drawdown_pct = ((balance - equity) / balance) * 100.0;
     }

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
                                    "\"drawdown_pct\":%.2f,"
                                    "\"positions\":%s"
                                 "}]"
                                 "}",
                                 InpVpsId, timestamp, account_id, broker, balance, equity, margin, free_margin, drawdown_pct, positions_json);

   // 4. Preparar HTTP POST
   char post_data[];
   char result[];
   string result_headers;
   
   StringToCharArray(payload, post_data, 0, WHOLE_ARRAY, CP_UTF8);
   ArrayResize(post_data, ArraySize(post_data) - 1); // Remover null-terminator

   string headers = "Content-Type: application/json\r\n";
   headers += "X-API-KEY: " + InpApiKey + "\r\n";
   headers += "Authorization: Bearer " + InpApiToken + "\r\n";
   
   int res = WebRequest("POST", InpDashboardUrl, headers, 3000, post_data, result, result_headers);
   
   if(res == -1)
     {
      int error_code = GetLastError();
      if (error_code == 4014) {
         Print("ERROR HTTP: Añade ", InpDashboardUrl, " a la lista de 'WebRequest' en Tools -> Options -> Expert Advisors.");
      } else {
         Print("Error conectando con Dashboard Master. Code: ", error_code);
      }
     }
  }

//+------------------------------------------------------------------+
