"""
Pydantic models for API request/response schemas
"""
from pydantic import BaseModel, Field, EmailStr
from datetime import datetime
from typing import Optional, List, Literal
from enum import Enum


# ============ Enums ============

class RequestStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    WAITING = "waiting_response"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class RequestPriority(str, Enum):
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    URGENT = "urgent"


class MessageType(str, Enum):
    TEXT = "text"
    REQUEST = "request"
    RESPONSE = "response"
    FOLLOW_UP = "follow_up"
    SYSTEM = "system"
    AGENT = "agent"


class ChannelType(str, Enum):
    PUBLIC = "public"
    PRIVATE = "private"
    DM = "dm"


# ============ User & Auth ============

class UserBase(BaseModel):
    email: EmailStr
    name: str
    role: Optional[str] = None
    avatar_url: Optional[str] = None


class UserCreate(UserBase):
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class User(UserBase):
    id: str
    org_id: Optional[str] = None
    team_id: Optional[str] = None
    is_active: bool = True
    created_at: datetime
    
    class Config:
        from_attributes = True


class UserWithToken(User):
    access_token: str
    token_type: str = "bearer"


# ============ Organization ============

class OrgCreate(BaseModel):
    name: str
    description: Optional[str] = None


class OrgJoin(BaseModel):
    invite_code: str


class Organization(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    invite_code: str
    created_at: datetime
    owner_id: str
    
    class Config:
        from_attributes = True


# ============ Team ============

class TeamCreate(BaseModel):
    name: str
    description: Optional[str] = None


class Team(BaseModel):
    id: str
    org_id: str
    name: str
    description: Optional[str] = None
    created_at: datetime
    
    class Config:
        from_attributes = True


class TeamWithMembers(Team):
    members: List[User] = []


# ============ Channel ============

class ChannelCreate(BaseModel):
    name: str
    description: Optional[str] = None
    channel_type: ChannelType = ChannelType.PUBLIC
    team_id: Optional[str] = None


class Channel(BaseModel):
    id: str
    org_id: str
    team_id: Optional[str] = None
    name: str
    description: Optional[str] = None
    channel_type: ChannelType
    created_at: datetime
    created_by: str
    
    class Config:
        from_attributes = True


class ChannelWithMembers(Channel):
    members: List[User] = []
    last_message: Optional["Message"] = None


# ============ Message ============

class MessageCreate(BaseModel):
    content: str
    channel_id: Optional[str] = None
    dm_recipient_id: Optional[str] = None
    parent_id: Optional[str] = None  # For threads
    message_type: MessageType = MessageType.TEXT


class Message(BaseModel):
    id: str
    org_id: str
    channel_id: Optional[str] = None
    sender_id: str
    content: str
    message_type: MessageType
    is_from_agent: bool = False
    parent_id: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class MessageWithSender(Message):
    sender: User


# ============ Request (AI-routed task) ============

class RequestCreate(BaseModel):
    content: str
    priority: RequestPriority = RequestPriority.NORMAL
    due_date: Optional[datetime] = None


class Request(BaseModel):
    id: str
    org_id: str
    from_user_id: str
    to_user_id: Optional[str] = None
    to_team_id: Optional[str] = None
    subject: str
    content: str
    status: RequestStatus
    priority: RequestPriority
    due_date: Optional[datetime] = None
    follow_up_count: int = 0
    last_follow_up: Optional[datetime] = None
    response: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class RequestWithUsers(Request):
    from_user: User
    to_user: Optional[User] = None


# ============ Task (user's queue) ============

class Task(BaseModel):
    id: str
    user_id: str
    request_id: str
    title: str
    description: str
    status: RequestStatus
    priority: RequestPriority
    due_date: Optional[datetime] = None
    created_at: datetime
    completed_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class TaskWithRequest(Task):
    request: RequestWithUsers


# ============ Direct Message Conversation ============

class DMConversation(BaseModel):
    id: str
    org_id: str
    participant_ids: List[str]
    created_at: datetime
    
    class Config:
        from_attributes = True


class DMConversationWithDetails(DMConversation):
    participants: List[User]
    last_message: Optional[Message] = None
    unread_count: int = 0


# ============ Agent Chat ============

class AgentChatRequest(BaseModel):
    message: str
    context_channel_id: Optional[str] = None


class AgentChatResponse(BaseModel):
    response: str
    action_taken: Optional[str] = None
    request_created: Optional[Request] = None


# ============ Notification ============

class Notification(BaseModel):
    id: str
    user_id: str
    title: str
    body: str
    link: Optional[str] = None
    is_read: bool = False
    created_at: datetime
    
    class Config:
        from_attributes = True


# ============ Presence ============

class UserPresence(BaseModel):
    user_id: str
    status: Literal["online", "away", "dnd", "offline"]
    last_seen: datetime


# ============ WebSocket Events ============

class WSEvent(BaseModel):
    event: str
    payload: dict


# Avoid circular import issues
ChannelWithMembers.model_rebuild()
