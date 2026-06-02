import os
import sys
import time
import requests
from datetime import datetime, timezone
import MetaTrader5 as mt5
from dotenv import load_dotenv

# Cargar configuración del backend
load_dotenv(os.path.join(os.path.dirname(__file__), "backend", ".env"))

DASHBOARD_URL = "https://trading.zenixtech.ai"
API_KEY = os.getenv("X_API_KEY", "")
VPS_TOKEN = os.getenv("VPS_SECRET_TOKEN", "")

def sync_account_history():
    print("--- QuantFib History Synchronizer ---")
    
    if not mt5.initialize():
        print(f"Error: No se pudo conectar a MT5. Error: {mt5.last_error()}")
        return

    acc = mt5.account_info()
    if not acc:
        print("Error: No se pudo obtener información de la cuenta activa en MT5.")
        return

    login = acc.login
    broker = acc.company
    server = acc.server
    name = acc.name
    
    print(f"Cuenta detectada: {login} en {broker}")
    print("Leyendo historial completo de operaciones...")

    # Obtener todos los deals (transacciones cerradas)
    from_date = datetime(2010, 1, 1) # Fecha muy antigua para capturar todo
    to_date = datetime.now()
    deals = mt5.history_deals_get(from_date, to_date)
    
    if deals is None or len(deals) == 0:
        print("No se encontraron operaciones en el historial.")
        return

    print(f"Se encontraron {len(deals)} transacciones.")
    
    # Ordenar por tiempo
    deals = sorted(deals, key=lambda x: x.time)
    
    snapshots = []
    running_balance = 0.0
    
    # Procesar deals para reconstruir la curva
    for deal in deals:
        # Solo nos interesan transacciones que afectan al balance (depósitos o cierres)
        # Entry in/out/out_by
        profit = deal.profit + deal.commission + deal.swap
        running_balance += profit
        
        # Crear un punto en la historia
        dt = datetime.fromtimestamp(deal.time, tz=timezone.utc)
        
        payload = {
            "vps_id": "history_sync",
            "timestamp_utc": dt.isoformat(),
            "accounts": [{
                "account_id": login,
                "broker": broker,
                "login": str(login),
                "server": server,
                "name": name,
                "balance": round(running_balance, 2),
                "equity": round(running_balance, 2),
                "margin": 0.0,
                "free_margin": round(running_balance, 2),
                "drawdown_pct": 0.0,
                "regime": "HISTORICAL",
                "active_mode": "SYNC",
                "positions": []
            }]
        }
        snapshots.append(payload)

    print(f"Enviando {len(snapshots)} puntos de historia al Dashboard...")
    
    # Enviar en bloques de 100 para no saturar la red
    headers = {
        "X-API-KEY": API_KEY,
        "Authorization": f"Bearer {VPS_TOKEN}",
        "Content-Type": "application/json"
    }
    
    chunk_size = 100
    for i in range(0, len(snapshots), chunk_size):
        chunk = snapshots[i:i + chunk_size]
        try:
            resp = requests.post(f"{DASHBOARD_URL}/api/v1/telemetry/bulk", json=chunk, headers=headers)
            if resp.status_code == 200:
                print(f"Progreso: {min(i + chunk_size, len(snapshots))}/{len(snapshots)} subidos.")
            else:
                print(f"Error subiendo bloque: {resp.status_code} - {resp.text}")
        except Exception as e:
            print(f"Excepción en subida: {e}")

    print("--- Sincronización Completada con Éxito ---")
    mt5.shutdown()

if __name__ == "__main__":
    sync_account_history()
