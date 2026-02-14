"""
Supabase database service - handles all database operations
"""
from supabase import create_client, Client
from typing import Optional, List, Dict, Any
from datetime import datetime
import secrets

from ..config import get_settings
from ..models.schemas import (
    User, UserCreate, Organization, OrgCreate,
    Team, TeamCreate, Channel, ChannelCreate,
    Message, MessageCreate, Request, RequestCreate,
    Task, RequestStatus, RequestPriority, MessageType, ChannelType
)


class DatabaseService:
    def __init__(self):
        settings = get_settings()
        self.client: Client = create_client(
            settings.supabase_url,
            settings.supabase_service_key  # Use service key for admin operations
        )
    
    # ============ Users ============
    
    def create_user(self, user: UserCreate, auth_user_id: str) -> User:
        """Create user profile after Supabase auth signup"""
        data = {
            "id": auth_user_id,
            "email": user.email,
            "name": user.name,
            "role": user.role,
            "avatar_url": user.avatar_url,
            "created_at": datetime.utcnow().isoformat()
        }
        result = self.client.table("users").insert(data).execute()
        return User(**result.data[0])
    
    def get_user(self, user_id: str) -> Optional[User]:
        result = self.client.table("users").select("*").eq("id", user_id).execute()
        return User(**result.data[0]) if result.data else None
    
    def get_user_by_email(self, email: str) -> Optional[User]:
        result = self.client.table("users").select("*").eq("email", email).execute()
        return User(**result.data[0]) if result.data else None
    
    def update_user(self, user_id: str, updates: Dict[str, Any]) -> User:
        result = self.client.table("users").update(updates).eq("id", user_id).execute()
        return User(**result.data[0])
    
    def get_org_users(self, org_id: str) -> List[User]:
        result = self.client.table("users").select("*").eq("org_id", org_id).execute()
        return [User(**u) for u in result.data]
    
    def get_team_users(self, team_id: str) -> List[User]:
        result = self.client.table("users").select("*").eq("team_id", team_id).execute()
        return [User(**u) for u in result.data]
    
    # ============ Organizations ============
    
    def create_organization(self, org: OrgCreate, owner_id: str) -> Organization:
        invite_code = secrets.token_urlsafe(16)
        data = {
            "name": org.name,
            "description": org.description,
            "owner_id": owner_id,
            "invite_code": invite_code,
            "created_at": datetime.utcnow().isoformat()
        }
        result = self.client.table("organizations").insert(data).execute()
        org_data = result.data[0]
        
        # Update user's org_id
        self.client.table("users").update({"org_id": org_data["id"]}).eq("id", owner_id).execute()
        
        # Create default #general channel
        self.create_channel(
            ChannelCreate(name="general", description="General discussion", channel_type=ChannelType.PUBLIC),
            org_id=org_data["id"],
            created_by=owner_id
        )
        
        return Organization(**org_data)
    
    def get_organization(self, org_id: str) -> Optional[Organization]:
        result = self.client.table("organizations").select("*").eq("id", org_id).execute()
        return Organization(**result.data[0]) if result.data else None
    
    def get_org_by_invite_code(self, invite_code: str) -> Optional[Organization]:
        result = self.client.table("organizations").select("*").eq("invite_code", invite_code).execute()
        return Organization(**result.data[0]) if result.data else None
    
    def join_organization(self, user_id: str, org_id: str) -> User:
        result = self.client.table("users").update({"org_id": org_id}).eq("id", user_id).execute()
        
        # Add to all public channels
        channels = self.client.table("channels").select("id").eq("org_id", org_id).eq("channel_type", "public").execute()
        for ch in channels.data:
            self.add_channel_member(ch["id"], user_id)
        
        return User(**result.data[0])
    
    def regenerate_invite_code(self, org_id: str) -> str:
        new_code = secrets.token_urlsafe(16)
        self.client.table("organizations").update({"invite_code": new_code}).eq("id", org_id).execute()
        return new_code
    
    # ============ Teams ============
    
    def create_team(self, team: TeamCreate, org_id: str) -> Team:
        data = {
            "org_id": org_id,
            "name": team.name,
            "description": team.description,
            "created_at": datetime.utcnow().isoformat()
        }
        result = self.client.table("teams").insert(data).execute()
        return Team(**result.data[0])
    
    def get_team(self, team_id: str) -> Optional[Team]:
        result = self.client.table("teams").select("*").eq("id", team_id).execute()
        return Team(**result.data[0]) if result.data else None
    
    def get_org_teams(self, org_id: str) -> List[Team]:
        result = self.client.table("teams").select("*").eq("org_id", org_id).execute()
        return [Team(**t) for t in result.data]
    
    def add_user_to_team(self, user_id: str, team_id: str) -> User:
        result = self.client.table("users").update({"team_id": team_id}).eq("id", user_id).execute()
        return User(**result.data[0])
    
    # ============ Channels ============
    
    def create_channel(self, channel: ChannelCreate, org_id: str, created_by: str) -> Channel:
        data = {
            "org_id": org_id,
            "team_id": channel.team_id,
            "name": channel.name,
            "description": channel.description,
            "channel_type": channel.channel_type.value,
            "created_by": created_by,
            "created_at": datetime.utcnow().isoformat()
        }
        result = self.client.table("channels").insert(data).execute()
        channel_data = result.data[0]
        
        # Add creator as member
        self.add_channel_member(channel_data["id"], created_by)
        
        # If public, add all org users
        if channel.channel_type == ChannelType.PUBLIC:
            users = self.get_org_users(org_id)
            for u in users:
                if u.id != created_by:
                    self.add_channel_member(channel_data["id"], u.id)
        
        return Channel(**channel_data)
    
    def get_channel(self, channel_id: str) -> Optional[Channel]:
        result = self.client.table("channels").select("*").eq("id", channel_id).execute()
        return Channel(**result.data[0]) if result.data else None
    
    def get_user_channels(self, user_id: str, org_id: str) -> List[Channel]:
        # Get channel IDs user is member of
        memberships = self.client.table("channel_members").select("channel_id").eq("user_id", user_id).execute()
        channel_ids = [m["channel_id"] for m in memberships.data]
        
        if not channel_ids:
            return []
        
        result = self.client.table("channels").select("*").eq("org_id", org_id).in_("id", channel_ids).execute()
        return [Channel(**c) for c in result.data]
    
    def add_channel_member(self, channel_id: str, user_id: str) -> None:
        try:
            self.client.table("channel_members").insert({
                "channel_id": channel_id,
                "user_id": user_id,
                "joined_at": datetime.utcnow().isoformat()
            }).execute()
        except Exception:
            pass  # Already a member
    
    def remove_channel_member(self, channel_id: str, user_id: str) -> None:
        self.client.table("channel_members").delete().eq("channel_id", channel_id).eq("user_id", user_id).execute()
    
    def get_channel_members(self, channel_id: str) -> List[User]:
        result = self.client.table("channel_members").select("user_id").eq("channel_id", channel_id).execute()
        user_ids = [m["user_id"] for m in result.data]
        
        if not user_ids:
            return []
        
        users_result = self.client.table("users").select("*").in_("id", user_ids).execute()
        return [User(**u) for u in users_result.data]
    
    # ============ Direct Messages ============
    
    def get_or_create_dm(self, org_id: str, user1_id: str, user2_id: str) -> Dict[str, Any]:
        """Get or create a DM conversation between two users"""
        # Check if DM exists
        sorted_ids = sorted([user1_id, user2_id])
        result = self.client.table("dm_conversations").select("*").eq("org_id", org_id).contains("participant_ids", sorted_ids).execute()
        
        if result.data:
            return result.data[0]
        
        # Create new DM
        data = {
            "org_id": org_id,
            "participant_ids": sorted_ids,
            "created_at": datetime.utcnow().isoformat()
        }
        result = self.client.table("dm_conversations").insert(data).execute()
        return result.data[0]
    
    def get_user_dms(self, user_id: str, org_id: str) -> List[Dict[str, Any]]:
        result = self.client.table("dm_conversations").select("*").eq("org_id", org_id).contains("participant_ids", [user_id]).execute()
        return result.data
    
    # ============ Messages ============
    
    def create_message(self, message: MessageCreate, org_id: str, sender_id: str, is_from_agent: bool = False) -> Message:
        data = {
            "org_id": org_id,
            "channel_id": message.channel_id,
            "sender_id": sender_id,
            "content": message.content,
            "message_type": message.message_type.value,
            "is_from_agent": is_from_agent,
            "parent_id": message.parent_id,
            "created_at": datetime.utcnow().isoformat()
        }
        result = self.client.table("messages").insert(data).execute()
        return Message(**result.data[0])
    
    def create_dm_message(self, dm_id: str, org_id: str, sender_id: str, content: str, is_from_agent: bool = False) -> Message:
        data = {
            "org_id": org_id,
            "dm_conversation_id": dm_id,
            "sender_id": sender_id,
            "content": content,
            "message_type": MessageType.TEXT.value,
            "is_from_agent": is_from_agent,
            "created_at": datetime.utcnow().isoformat()
        }
        result = self.client.table("messages").insert(data).execute()
        return Message(**result.data[0])
    
    def get_channel_messages(self, channel_id: str, limit: int = 50, before: Optional[str] = None) -> List[Dict[str, Any]]:
        query = self.client.table("messages").select("*, sender:users(*)").eq("channel_id", channel_id).order("created_at", desc=True).limit(limit)
        
        if before:
            query = query.lt("created_at", before)
        
        result = query.execute()
        return list(reversed(result.data))  # Return in chronological order
    
    def get_dm_messages(self, dm_id: str, limit: int = 50, before: Optional[str] = None) -> List[Dict[str, Any]]:
        query = self.client.table("messages").select("*, sender:users(*)").eq("dm_conversation_id", dm_id).order("created_at", desc=True).limit(limit)
        
        if before:
            query = query.lt("created_at", before)
        
        result = query.execute()
        return list(reversed(result.data))
    
    # ============ Requests (AI-routed tasks) ============
    
    def create_request(
        self, 
        org_id: str,
        from_user_id: str,
        subject: str,
        content: str,
        to_user_id: Optional[str] = None,
        to_team_id: Optional[str] = None,
        priority: RequestPriority = RequestPriority.NORMAL,
        due_date: Optional[datetime] = None
    ) -> Request:
        data = {
            "org_id": org_id,
            "from_user_id": from_user_id,
            "to_user_id": to_user_id,
            "to_team_id": to_team_id,
            "subject": subject,
            "content": content,
            "status": RequestStatus.PENDING.value,
            "priority": priority.value,
            "due_date": due_date.isoformat() if due_date else None,
            "follow_up_count": 0,
            "created_at": datetime.utcnow().isoformat()
        }
        result = self.client.table("requests").insert(data).execute()
        request_data = result.data[0]
        
        # Create task for recipient
        if to_user_id:
            self.create_task(
                user_id=to_user_id,
                request_id=request_data["id"],
                title=f"Request from {from_user_id}",  # Will be resolved with name
                description=content,
                priority=priority,
                due_date=due_date
            )
        
        return Request(**request_data)
    
    def get_request(self, request_id: str) -> Optional[Request]:
        result = self.client.table("requests").select("*").eq("id", request_id).execute()
        return Request(**result.data[0]) if result.data else None
    
    def get_user_outgoing_requests(self, user_id: str) -> List[Request]:
        result = self.client.table("requests").select("*").eq("from_user_id", user_id).order("created_at", desc=True).execute()
        return [Request(**r) for r in result.data]
    
    def get_user_incoming_requests(self, user_id: str) -> List[Request]:
        result = self.client.table("requests").select("*").eq("to_user_id", user_id).order("created_at", desc=True).execute()
        return [Request(**r) for r in result.data]
    
    def update_request(self, request_id: str, updates: Dict[str, Any]) -> Request:
        result = self.client.table("requests").update(updates).eq("id", request_id).execute()
        return Request(**result.data[0])
    
    def complete_request(self, request_id: str, response: str) -> Request:
        return self.update_request(request_id, {
            "status": RequestStatus.COMPLETED.value,
            "response": response,
            "completed_at": datetime.utcnow().isoformat()
        })
    
    # ============ Tasks ============
    
    def create_task(
        self,
        user_id: str,
        request_id: str,
        title: str,
        description: str,
        priority: RequestPriority = RequestPriority.NORMAL,
        due_date: Optional[datetime] = None
    ) -> Task:
        data = {
            "user_id": user_id,
            "request_id": request_id,
            "title": title,
            "description": description,
            "status": RequestStatus.PENDING.value,
            "priority": priority.value,
            "due_date": due_date.isoformat() if due_date else None,
            "created_at": datetime.utcnow().isoformat()
        }
        result = self.client.table("tasks").insert(data).execute()
        return Task(**result.data[0])
    
    def get_user_tasks(self, user_id: str, status: Optional[RequestStatus] = None) -> List[Task]:
        query = self.client.table("tasks").select("*").eq("user_id", user_id)
        
        if status:
            query = query.eq("status", status.value)
        
        result = query.order("created_at", desc=True).execute()
        return [Task(**t) for t in result.data]
    
    def update_task(self, task_id: str, updates: Dict[str, Any]) -> Task:
        result = self.client.table("tasks").update(updates).eq("id", task_id).execute()
        return Task(**result.data[0])
    
    def complete_task(self, task_id: str) -> Task:
        return self.update_task(task_id, {
            "status": RequestStatus.COMPLETED.value,
            "completed_at": datetime.utcnow().isoformat()
        })
    
    # ============ Notifications ============
    
    def create_notification(self, user_id: str, title: str, body: str, link: Optional[str] = None) -> Dict[str, Any]:
        data = {
            "user_id": user_id,
            "title": title,
            "body": body,
            "link": link,
            "is_read": False,
            "created_at": datetime.utcnow().isoformat()
        }
        result = self.client.table("notifications").insert(data).execute()
        return result.data[0]
    
    def get_user_notifications(self, user_id: str, unread_only: bool = False) -> List[Dict[str, Any]]:
        query = self.client.table("notifications").select("*").eq("user_id", user_id)
        
        if unread_only:
            query = query.eq("is_read", False)
        
        result = query.order("created_at", desc=True).limit(50).execute()
        return result.data
    
    def mark_notification_read(self, notification_id: str) -> None:
        self.client.table("notifications").update({"is_read": True}).eq("id", notification_id).execute()
    
    def mark_all_notifications_read(self, user_id: str) -> None:
        self.client.table("notifications").update({"is_read": True}).eq("user_id", user_id).eq("is_read", False).execute()


# Singleton instance
_db_service: Optional[DatabaseService] = None


def get_database() -> DatabaseService:
    global _db_service
    if _db_service is None:
        _db_service = DatabaseService()
    return _db_service
