import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

# Cargar env del backend
load_dotenv(os.path.join(os.path.dirname(__file__), "backend", ".env"))

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://quantfib_admin:Jvn6lrw_EG!Ww-BrbrnDjF9MdJw!o39M@db:5432/quantfib")

# Si estás ejecutando esto localmente y la DB está en Docker, 
# asegúrate de que el puerto esté mapeado o usa localhost:5432 si aplica.
# Para este entorno, asumimos que DATABASE_URL es accesible.

engine = create_engine(DATABASE_URL)

ACCOUNTS = [
    {"login": "27499015", "broker": "Vantage International Group Limited"},
    {"login": "27490417", "broker": "Vantage International Group Limited"},
    {"login": "27490367", "broker": "Vantage International Group Limited"},
]

def seed():
    print("--- Inyectando Cuentas Fijas ---")
    with engine.connect() as conn:
        for acc in ACCOUNTS:
            login = acc["login"]
            broker = acc["broker"]
            
            # Verificar si ya existe
            res = conn.execute(text("SELECT id FROM accounts WHERE login = :login"), {"login": login}).fetchone()
            
            status_data = {
                "account_id": int(login),
                "broker": broker,
                "name": f"Master Account {login}",
                "balance": 10000.00,
                "equity": 10000.00,
                "margin": 0.0,
                "free_margin": 10000.00,
                "margin_level": 0.0,
                "drawdown_pct": 0.0,
                "regime": "RANGE",
                "active_mode": "NORMAL",
                "daily_pnl_usd": 0.0,
                "open_risk_pct": 0.0,
                "win_rate": 0.0,
                "profit_factor": 0.0,
                "kelly_fraction": 0.0,
                "positions": []
            }
            
            import json
            status_json = json.dumps(status_data)

            if not res:
                query = text("""
                    INSERT INTO accounts (broker, login, server, name, status_data, is_active, last_update)
                    VALUES (:broker, :login, :server, :name, :status_data, true, now())
                """)
                conn.execute(query, {
                    "broker": broker,
                    "login": login,
                    "server": "vantage-master",
                    "name": f"Account {login}",
                    "status_data": status_json
                })
                print(f"Cuenta {login} CREADA.")
            else:
                query = text("""
                    UPDATE accounts 
                    SET status_data = :status_data, last_update = now()
                    WHERE login = :login
                """)
                conn.execute(query, {
                    "login": login,
                    "status_data": status_json
                })
                print(f"Cuenta {login} ACTUALIZADA.")
        
        conn.commit()
    print("--- Proceso Completado ---")

if __name__ == "__main__":
    seed()
