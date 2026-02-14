"""
Notifications API routes
"""
from fastapi import APIRouter, Depends
from typing import List

from ..models.schemas import User, Notification
from ..services.auth import get_current_user
from ..services.database import get_database, DatabaseService

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get("", response_model=List[Notification])
async def get_notifications(
    unread_only: bool = False,
    user: User = Depends(get_current_user),
    db: DatabaseService = Depends(get_database)
):
    """Get notifications for current user"""
    notifs = db.get_user_notifications(user.id, unread_only)
    return [Notification(**n) for n in notifs]


@router.post("/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    user: User = Depends(get_current_user),
    db: DatabaseService = Depends(get_database)
):
    """Mark a notification as read"""
    db.mark_notification_read(notification_id)
    return {"message": "Marked as read"}


@router.post("/read-all")
async def mark_all_read(
    user: User = Depends(get_current_user),
    db: DatabaseService = Depends(get_database)
):
    """Mark all notifications as read"""
    db.mark_all_notifications_read(user.id)
    return {"message": "All marked as read"}
