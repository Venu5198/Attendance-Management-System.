"""WebSocket real-time broadcast router for alerts and task notifications."""

import asyncio
import json
import logging
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Real-Time WebSockets"])


class ConnectionManager:
    """Manages active tenant WebSocket subscriber connections."""

    def __init__(self):
        # tenant_id -> list of active WebSockets
        self.active_connections: dict[str, list[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, tenant_id: str):
        await websocket.accept()
        if tenant_id not in self.active_connections:
            self.active_connections[tenant_id] = []
        self.active_connections[tenant_id].append(websocket)
        logger.info("WebSocket connected for tenant '%s'. Total: %d", tenant_id, len(self.active_connections[tenant_id]))

    def disconnect(self, websocket: WebSocket, tenant_id: str):
        if tenant_id in self.active_connections:
            if websocket in self.active_connections[tenant_id]:
                self.active_connections[tenant_id].remove(websocket)
            if not self.active_connections[tenant_id]:
                del self.active_connections[tenant_id]
        logger.info("WebSocket disconnected for tenant '%s'", tenant_id)

    async def broadcast_to_tenant(self, tenant_id: str, message: dict[str, Any]):
        """Broadcast event to all connected clients under a specific tenant."""
        conns = self.active_connections.get(tenant_id, [])
        dead_conns = []
        payload = json.dumps(message)
        for conn in conns:
            try:
                await conn.send_text(payload)
            except Exception:
                dead_conns.append(conn)

        for dead in dead_conns:
            self.disconnect(dead, tenant_id)


ws_manager = ConnectionManager()


@router.websocket("/ws/notifications/{tenant_id}")
async def websocket_notifications(websocket: WebSocket, tenant_id: str):
    """
    Subscribes the browser client to real-time events for this tenant.
    Events broadcasted:
    - Celery task completion
    - Attendance check-in / check-out
    - Compliance / WFH violations
    """
    await ws_manager.connect(websocket, tenant_id)
    try:
        # Send initial connection handshake
        await websocket.send_json({
            "type": "SYSTEM_CONNECTED",
            "message": f"Connected to Real-Time Notification Stream for tenant '{tenant_id}'",
        })
        while True:
            # Keepalive ping/pong
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, tenant_id)
    except Exception as exc:
        logger.warning("WebSocket exception: %s", exc)
        ws_manager.disconnect(websocket, tenant_id)
