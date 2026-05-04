import logging
from typing import Any, List
from fastapi import WebSocket

log = logging.getLogger("mt5-dashboard")

class ConnectionManager:
    def __init__(self):
        self.active: List[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)
        log.info(f"WS connected. Total: {len(self.active)}")

    def disconnect(self, ws: WebSocket):
        self.active = [c for c in self.active if c != ws]
        log.info(f"WS disconnected. Total: {len(self.active)}")

    async def broadcast(self, data: Any):
        dead = []
        for ws in self.active:
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)

manager = ConnectionManager()
