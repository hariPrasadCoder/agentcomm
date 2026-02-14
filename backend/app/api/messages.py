"""
Direct Messages API routes
"""
from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Optional

from ..models.schemas import (
    User, Message, DMConversation, DMConversationWithDetails
)
from ..services.auth import get_current_user
from ..services.database import get_database, DatabaseService

router = APIRouter(prefix="/dm", tags=["Direct Messages"])


@router.get("", response_model=List[DMConversationWithDetails])
async def get_dm_conversations(
    user: User = Depends(get_current_user),
    db: DatabaseService = Depends(get_database)
):
    """Get all DM conversations for current user"""
    if not user.org_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User must belong to an organization"
        )
    
    dms = db.get_user_dms(user.id, user.org_id)
    result = []
    
    for dm in dms:
        # Get other participant
        other_ids = [pid for pid in dm["participant_ids"] if pid != user.id]
        participants = [db.get_user(pid) for pid in dm["participant_ids"]]
        participants = [p for p in participants if p is not None]
        
        # Get last message
        messages = db.get_dm_messages(dm["id"], limit=1)
        last_message = Message(**messages[0]) if messages else None
        
        result.append(DMConversationWithDetails(
            id=dm["id"],
            org_id=dm["org_id"],
            participant_ids=dm["participant_ids"],
            created_at=dm["created_at"],
            participants=participants,
            last_message=last_message,
            unread_count=0  # TODO: Implement unread tracking
        ))
    
    return result


@router.post("/{user_id}", response_model=DMConversationWithDetails)
async def start_or_get_dm(
    user_id: str,
    user: User = Depends(get_current_user),
    db: DatabaseService = Depends(get_database)
):
    """Start a DM conversation with another user (or get existing)"""
    if not user.org_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User must belong to an organization"
        )
    
    if user_id == user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot DM yourself"
        )
    
    # Verify target user exists and is in same org
    target_user = db.get_user(user_id)
    if not target_user or target_user.org_id != user.org_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    dm = db.get_or_create_dm(user.org_id, user.id, user_id)
    
    participants = [user, target_user]
    messages = db.get_dm_messages(dm["id"], limit=1)
    last_message = Message(**messages[0]) if messages else None
    
    return DMConversationWithDetails(
        id=dm["id"],
        org_id=dm["org_id"],
        participant_ids=dm["participant_ids"],
        created_at=dm["created_at"],
        participants=participants,
        last_message=last_message,
        unread_count=0
    )


@router.get("/{dm_id}/messages")
async def get_dm_messages(
    dm_id: str,
    limit: int = 50,
    before: Optional[str] = None,
    user: User = Depends(get_current_user),
    db: DatabaseService = Depends(get_database)
):
    """Get messages in a DM conversation"""
    return db.get_dm_messages(dm_id, limit, before)


@router.post("/{dm_id}/messages", response_model=Message)
async def send_dm_message(
    dm_id: str,
    content: str,
    user: User = Depends(get_current_user),
    db: DatabaseService = Depends(get_database)
):
    """Send a message in a DM conversation"""
    if not user.org_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User must belong to an organization"
        )
    
    return db.create_dm_message(dm_id, user.org_id, user.id, content)
