"""
AgentComm Backend - FastAPI Application
"""
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from typing import Dict, Set
import json

from .config import get_settings
from .api import auth, organizations, channels, messages, agent, notifications
from .services.auth import get_auth_service
from .services.database import get_database


# WebSocket connection manager for real-time updates
class ConnectionManager:
    def __init__(self):
        # user_id -> set of websocket connections
        self.active_connections: Dict[str, Set[WebSocket]] = {}
        # org_id -> set of user_ids (for broadcast)
        self.org_users: Dict[str, Set[str]] = {}
    
    async def connect(self, websocket: WebSocket, user_id: str, org_id: str):
        await websocket.accept()
        
        if user_id not in self.active_connections:
            self.active_connections[user_id] = set()
        self.active_connections[user_id].add(websocket)
        
        if org_id not in self.org_users:
            self.org_users[org_id] = set()
        self.org_users[org_id].add(user_id)
    
    def disconnect(self, websocket: WebSocket, user_id: str, org_id: str):
        if user_id in self.active_connections:
            self.active_connections[user_id].discard(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]
        
        if org_id in self.org_users:
            self.org_users[org_id].discard(user_id)
    
    async def send_to_user(self, user_id: str, message: dict):
        """Send message to all connections of a specific user"""
        if user_id in self.active_connections:
            for connection in self.active_connections[user_id]:
                try:
                    await connection.send_json(message)
                except Exception:
                    pass
    
    async def broadcast_to_org(self, org_id: str, message: dict, exclude_user: str = None):
        """Broadcast message to all users in an organization"""
        if org_id in self.org_users:
            for user_id in self.org_users[org_id]:
                if user_id != exclude_user:
                    await self.send_to_user(user_id, message)
    
    async def broadcast_to_channel(self, channel_id: str, message: dict, exclude_user: str = None):
        """Broadcast message to all members of a channel"""
        db = get_database()
        members = db.get_channel_members(channel_id)
        for member in members:
            if member.id != exclude_user:
                await self.send_to_user(member.id, message)


manager = ConnectionManager()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    settings = get_settings()
    print(f"🚀 Starting {settings.app_name}")
    yield
    # Shutdown
    print("👋 Shutting down")


# Create FastAPI app
app = FastAPI(
    title="AgentComm",
    description="AI-first communication platform for teams",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, set specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router, prefix="/api")
app.include_router(organizations.router, prefix="/api")
app.include_router(channels.router, prefix="/api")
app.include_router(messages.router, prefix="/api")
app.include_router(agent.router, prefix="/api")
app.include_router(notifications.router, prefix="/api")


@app.get("/")
async def root():
    return {
        "name": "AgentComm API",
        "version": "1.0.0",
        "status": "running"
    }


@app.get("/health")
async def health():
    return {"status": "healthy"}


# WebSocket endpoint for real-time updates
@app.websocket("/ws/{token}")
async def websocket_endpoint(websocket: WebSocket, token: str):
    """
    WebSocket connection for real-time updates.
    Authenticate with JWT token in path.
    """
    auth_service = get_auth_service()
    
    try:
        # Verify token and get user
        user = auth_service.get_user_from_token(token)
        
        if not user.org_id:
            await websocket.close(code=4003)
            return
        
        # Connect
        await manager.connect(websocket, user.id, user.org_id)
        
        # Send connection confirmation
        await websocket.send_json({
            "event": "connected",
            "payload": {"user_id": user.id}
        })
        
        # Broadcast user online status
        await manager.broadcast_to_org(
            user.org_id,
            {"event": "user_online", "payload": {"user_id": user.id, "name": user.name}},
            exclude_user=user.id
        )
        
        try:
            while True:
                # Receive messages from client
                data = await websocket.receive_text()
                message = json.loads(data)
                
                event_type = message.get("event")
                payload = message.get("payload", {})
                
                if event_type == "typing":
                    # Broadcast typing indicator
                    channel_id = payload.get("channel_id")
                    dm_id = payload.get("dm_id")
                    
                    if channel_id:
                        await manager.broadcast_to_channel(
                            channel_id,
                            {"event": "typing", "payload": {"user_id": user.id, "channel_id": channel_id}},
                            exclude_user=user.id
                        )
                    elif dm_id:
                        # Get other participant and send typing
                        db = get_database()
                        dms = db.get_user_dms(user.id, user.org_id)
                        dm = next((d for d in dms if d["id"] == dm_id), None)
                        if dm:
                            other_id = next((pid for pid in dm["participant_ids"] if pid != user.id), None)
                            if other_id:
                                await manager.send_to_user(
                                    other_id,
                                    {"event": "typing", "payload": {"user_id": user.id, "dm_id": dm_id}}
                                )
                
                elif event_type == "message":
                    # Handle new message (this should go through API, but we can support WS too)
                    pass
                
                elif event_type == "ping":
                    await websocket.send_json({"event": "pong"})
        
        except WebSocketDisconnect:
            pass
        finally:
            # Disconnect
            manager.disconnect(websocket, user.id, user.org_id)
            
            # Broadcast user offline status
            await manager.broadcast_to_org(
                user.org_id,
                {"event": "user_offline", "payload": {"user_id": user.id}},
                exclude_user=user.id
            )
    
    except Exception as e:
        await websocket.close(code=4001)


# Helper function to broadcast messages (used by API routes)
async def broadcast_message(channel_id: str, message: dict, sender_id: str):
    """Broadcast a new message to channel members"""
    await manager.broadcast_to_channel(
        channel_id,
        {"event": "new_message", "payload": message},
        exclude_user=sender_id
    )


async def send_notification(user_id: str, notification: dict):
    """Send a notification to a specific user"""
    await manager.send_to_user(
        user_id,
        {"event": "notification", "payload": notification}
    )


# Export for use in API routes
app.state.broadcast_message = broadcast_message
app.state.send_notification = send_notification


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
