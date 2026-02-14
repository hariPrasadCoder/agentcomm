"""
Channels API routes
"""
from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Optional

from ..models.schemas import (
    Channel, ChannelCreate, ChannelWithMembers, User,
    Message, MessageCreate
)
from ..services.auth import get_current_user
from ..services.database import get_database, DatabaseService

router = APIRouter(prefix="/channels", tags=["Channels"])


@router.post("", response_model=Channel)
async def create_channel(
    channel_data: ChannelCreate,
    user: User = Depends(get_current_user),
    db: DatabaseService = Depends(get_database)
):
    """Create a new channel"""
    if not user.org_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User must belong to an organization"
        )
    return db.create_channel(channel_data, user.org_id, user.id)


@router.get("", response_model=List[Channel])
async def get_channels(
    user: User = Depends(get_current_user),
    db: DatabaseService = Depends(get_database)
):
    """Get all channels user has access to"""
    if not user.org_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User must belong to an organization"
        )
    return db.get_user_channels(user.id, user.org_id)


@router.get("/{channel_id}", response_model=ChannelWithMembers)
async def get_channel(
    channel_id: str,
    user: User = Depends(get_current_user),
    db: DatabaseService = Depends(get_database)
):
    """Get channel details with members"""
    channel = db.get_channel(channel_id)
    if not channel:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Channel not found"
        )
    
    members = db.get_channel_members(channel_id)
    return ChannelWithMembers(**channel.model_dump(), members=members)


@router.post("/{channel_id}/join")
async def join_channel(
    channel_id: str,
    user: User = Depends(get_current_user),
    db: DatabaseService = Depends(get_database)
):
    """Join a channel"""
    channel = db.get_channel(channel_id)
    if not channel:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Channel not found"
        )
    
    db.add_channel_member(channel_id, user.id)
    return {"message": f"Joined channel #{channel.name}"}


@router.post("/{channel_id}/leave")
async def leave_channel(
    channel_id: str,
    user: User = Depends(get_current_user),
    db: DatabaseService = Depends(get_database)
):
    """Leave a channel"""
    db.remove_channel_member(channel_id, user.id)
    return {"message": "Left channel"}


# ============ Messages ============

@router.get("/{channel_id}/messages")
async def get_channel_messages(
    channel_id: str,
    limit: int = 50,
    before: Optional[str] = None,
    user: User = Depends(get_current_user),
    db: DatabaseService = Depends(get_database)
):
    """Get messages in a channel"""
    return db.get_channel_messages(channel_id, limit, before)


@router.post("/{channel_id}/messages", response_model=Message)
async def send_channel_message(
    channel_id: str,
    message_data: MessageCreate,
    user: User = Depends(get_current_user),
    db: DatabaseService = Depends(get_database)
):
    """Send a message to a channel"""
    if not user.org_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User must belong to an organization"
        )
    
    message_data.channel_id = channel_id
    return db.create_message(message_data, user.org_id, user.id)
