"""
Local SQLite database service - mirrors the Supabase interface
For quick local testing without cloud setup
"""
import sqlite3
import uuid
import json
import secrets
from datetime import datetime
from typing import Optional, List, Dict, Any
from pathlib import Path

from ..config import get_settings
from ..models.schemas import (
    User, UserCreate, Organization, OrgCreate,
    Team, TeamCreate, Channel, ChannelCreate,
    Message, MessageCreate, Request, RequestCreate,
    Task, RequestStatus, RequestPriority, MessageType, ChannelType
)


def dict_factory(cursor, row):
    """Convert SQLite rows to dictionaries"""
    d = {}
    for idx, col in enumerate(cursor.description):
        d[col[0]] = row[idx]
    return d


class LocalDatabaseService:
    def __init__(self):
        settings = get_settings()
        self.db_path = settings.sqlite_path
        self._init_db()
    
    def _get_conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = dict_factory
        return conn
    
    def _init_db(self):
        """Initialize the SQLite database with schema"""
        conn = self._get_conn()
        cursor = conn.cursor()
        
        # Organizations
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS organizations (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                invite_code TEXT UNIQUE NOT NULL,
                owner_id TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Users
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                name TEXT NOT NULL,
                role TEXT,
                avatar_url TEXT,
                org_id TEXT,
                team_id TEXT,
                is_active INTEGER DEFAULT 1,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (org_id) REFERENCES organizations(id)
            )
        """)
        
        # Teams
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS teams (
                id TEXT PRIMARY KEY,
                org_id TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (org_id) REFERENCES organizations(id)
            )
        """)
        
        # Channels
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS channels (
                id TEXT PRIMARY KEY,
                org_id TEXT NOT NULL,
                team_id TEXT,
                name TEXT NOT NULL,
                description TEXT,
                channel_type TEXT NOT NULL DEFAULT 'public',
                created_by TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (org_id) REFERENCES organizations(id)
            )
        """)
        
        # Channel Members
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS channel_members (
                id TEXT PRIMARY KEY,
                channel_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                joined_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (channel_id) REFERENCES channels(id),
                FOREIGN KEY (user_id) REFERENCES users(id),
                UNIQUE(channel_id, user_id)
            )
        """)
        
        # DM Conversations
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS dm_conversations (
                id TEXT PRIMARY KEY,
                org_id TEXT NOT NULL,
                participant_ids TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (org_id) REFERENCES organizations(id)
            )
        """)
        
        # Messages
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                org_id TEXT NOT NULL,
                channel_id TEXT,
                dm_conversation_id TEXT,
                sender_id TEXT NOT NULL,
                content TEXT NOT NULL,
                message_type TEXT NOT NULL DEFAULT 'text',
                is_from_agent INTEGER DEFAULT 0,
                parent_id TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT,
                FOREIGN KEY (org_id) REFERENCES organizations(id)
            )
        """)
        
        # Requests
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS requests (
                id TEXT PRIMARY KEY,
                org_id TEXT NOT NULL,
                from_user_id TEXT NOT NULL,
                to_user_id TEXT,
                to_team_id TEXT,
                subject TEXT NOT NULL,
                content TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                priority TEXT NOT NULL DEFAULT 'normal',
                due_date TEXT,
                follow_up_count INTEGER DEFAULT 0,
                last_follow_up TEXT,
                response TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                completed_at TEXT,
                FOREIGN KEY (org_id) REFERENCES organizations(id)
            )
        """)
        
        # Tasks
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                request_id TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                priority TEXT NOT NULL DEFAULT 'normal',
                due_date TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                completed_at TEXT,
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (request_id) REFERENCES requests(id)
            )
        """)
        
        # Notifications
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS notifications (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                title TEXT NOT NULL,
                body TEXT NOT NULL,
                link TEXT,
                is_read INTEGER DEFAULT 0,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        """)
        
        conn.commit()
        conn.close()
    
    def _gen_id(self) -> str:
        return str(uuid.uuid4())
    
    def _now(self) -> str:
        return datetime.utcnow().isoformat()
    
    # ============ Users ============
    
    def create_user(self, user: UserCreate, password_hash: str) -> User:
        """Create user with hashed password"""
        user_id = self._gen_id()
        conn = self._get_conn()
        cursor = conn.cursor()
        
        cursor.execute("""
            INSERT INTO users (id, email, password_hash, name, role, avatar_url, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (user_id, user.email, password_hash, user.name, user.role, user.avatar_url, self._now()))
        
        conn.commit()
        result = cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        conn.close()
        
        return self._row_to_user(result)
    
    def get_user(self, user_id: str) -> Optional[User]:
        conn = self._get_conn()
        result = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        conn.close()
        return self._row_to_user(result) if result else None
    
    def get_user_by_email(self, email: str) -> Optional[Dict]:
        """Returns dict with password_hash for auth"""
        conn = self._get_conn()
        result = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        conn.close()
        return result
    
    def update_user(self, user_id: str, updates: Dict[str, Any]) -> User:
        conn = self._get_conn()
        set_clause = ", ".join(f"{k} = ?" for k in updates.keys())
        values = list(updates.values()) + [user_id]
        conn.execute(f"UPDATE users SET {set_clause} WHERE id = ?", values)
        conn.commit()
        result = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        conn.close()
        return self._row_to_user(result)
    
    def get_org_users(self, org_id: str) -> List[User]:
        conn = self._get_conn()
        results = conn.execute("SELECT * FROM users WHERE org_id = ?", (org_id,)).fetchall()
        conn.close()
        return [self._row_to_user(r) for r in results]
    
    def get_team_users(self, team_id: str) -> List[User]:
        conn = self._get_conn()
        results = conn.execute("SELECT * FROM users WHERE team_id = ?", (team_id,)).fetchall()
        conn.close()
        return [self._row_to_user(r) for r in results]
    
    def _row_to_user(self, row: Dict) -> User:
        return User(
            id=row["id"],
            email=row["email"],
            name=row["name"],
            role=row.get("role"),
            avatar_url=row.get("avatar_url"),
            org_id=row.get("org_id"),
            team_id=row.get("team_id"),
            is_active=bool(row.get("is_active", 1)),
            created_at=row["created_at"]
        )
    
    # ============ Organizations ============
    
    def create_organization(self, org: OrgCreate, owner_id: str) -> Organization:
        org_id = self._gen_id()
        invite_code = secrets.token_urlsafe(16)
        conn = self._get_conn()
        cursor = conn.cursor()
        
        cursor.execute("""
            INSERT INTO organizations (id, name, description, invite_code, owner_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (org_id, org.name, org.description, invite_code, owner_id, self._now()))
        
        # Update user's org_id
        cursor.execute("UPDATE users SET org_id = ? WHERE id = ?", (org_id, owner_id))
        
        conn.commit()
        
        # Create default #general channel
        self.create_channel(
            ChannelCreate(name="general", description="General discussion", channel_type=ChannelType.PUBLIC),
            org_id=org_id,
            created_by=owner_id
        )
        
        result = cursor.execute("SELECT * FROM organizations WHERE id = ?", (org_id,)).fetchone()
        conn.close()
        
        return Organization(**result)
    
    def get_organization(self, org_id: str) -> Optional[Organization]:
        conn = self._get_conn()
        result = conn.execute("SELECT * FROM organizations WHERE id = ?", (org_id,)).fetchone()
        conn.close()
        return Organization(**result) if result else None
    
    def get_org_by_invite_code(self, invite_code: str) -> Optional[Organization]:
        conn = self._get_conn()
        result = conn.execute("SELECT * FROM organizations WHERE invite_code = ?", (invite_code,)).fetchone()
        conn.close()
        return Organization(**result) if result else None
    
    def join_organization(self, user_id: str, org_id: str) -> User:
        conn = self._get_conn()
        conn.execute("UPDATE users SET org_id = ? WHERE id = ?", (org_id, user_id))
        conn.commit()
        
        # Add to all public channels
        channels = conn.execute(
            "SELECT id FROM channels WHERE org_id = ? AND channel_type = 'public'", 
            (org_id,)
        ).fetchall()
        for ch in channels:
            self.add_channel_member(ch["id"], user_id)
        
        result = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        conn.close()
        return self._row_to_user(result)
    
    def regenerate_invite_code(self, org_id: str) -> str:
        new_code = secrets.token_urlsafe(16)
        conn = self._get_conn()
        conn.execute("UPDATE organizations SET invite_code = ? WHERE id = ?", (new_code, org_id))
        conn.commit()
        conn.close()
        return new_code
    
    # ============ Teams ============
    
    def create_team(self, team: TeamCreate, org_id: str) -> Team:
        team_id = self._gen_id()
        conn = self._get_conn()
        conn.execute("""
            INSERT INTO teams (id, org_id, name, description, created_at)
            VALUES (?, ?, ?, ?, ?)
        """, (team_id, org_id, team.name, team.description, self._now()))
        conn.commit()
        result = conn.execute("SELECT * FROM teams WHERE id = ?", (team_id,)).fetchone()
        conn.close()
        return Team(**result)
    
    def get_team(self, team_id: str) -> Optional[Team]:
        conn = self._get_conn()
        result = conn.execute("SELECT * FROM teams WHERE id = ?", (team_id,)).fetchone()
        conn.close()
        return Team(**result) if result else None
    
    def get_org_teams(self, org_id: str) -> List[Team]:
        conn = self._get_conn()
        results = conn.execute("SELECT * FROM teams WHERE org_id = ?", (org_id,)).fetchall()
        conn.close()
        return [Team(**r) for r in results]
    
    def add_user_to_team(self, user_id: str, team_id: str) -> User:
        conn = self._get_conn()
        conn.execute("UPDATE users SET team_id = ? WHERE id = ?", (team_id, user_id))
        conn.commit()
        result = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        conn.close()
        return self._row_to_user(result)
    
    # ============ Channels ============
    
    def create_channel(self, channel: ChannelCreate, org_id: str, created_by: str) -> Channel:
        channel_id = self._gen_id()
        conn = self._get_conn()
        conn.execute("""
            INSERT INTO channels (id, org_id, team_id, name, description, channel_type, created_by, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (channel_id, org_id, channel.team_id, channel.name, channel.description, 
              channel.channel_type.value, created_by, self._now()))
        conn.commit()
        
        # Add creator as member
        self.add_channel_member(channel_id, created_by)
        
        # If public, add all org users
        if channel.channel_type == ChannelType.PUBLIC:
            users = self.get_org_users(org_id)
            for u in users:
                if u.id != created_by:
                    self.add_channel_member(channel_id, u.id)
        
        result = conn.execute("SELECT * FROM channels WHERE id = ?", (channel_id,)).fetchone()
        conn.close()
        return Channel(**result)
    
    def get_channel(self, channel_id: str) -> Optional[Channel]:
        conn = self._get_conn()
        result = conn.execute("SELECT * FROM channels WHERE id = ?", (channel_id,)).fetchone()
        conn.close()
        return Channel(**result) if result else None
    
    def get_user_channels(self, user_id: str, org_id: str) -> List[Channel]:
        conn = self._get_conn()
        results = conn.execute("""
            SELECT c.* FROM channels c
            JOIN channel_members cm ON c.id = cm.channel_id
            WHERE cm.user_id = ? AND c.org_id = ?
        """, (user_id, org_id)).fetchall()
        conn.close()
        return [Channel(**r) for r in results]
    
    def add_channel_member(self, channel_id: str, user_id: str) -> None:
        conn = self._get_conn()
        try:
            conn.execute("""
                INSERT INTO channel_members (id, channel_id, user_id, joined_at)
                VALUES (?, ?, ?, ?)
            """, (self._gen_id(), channel_id, user_id, self._now()))
            conn.commit()
        except sqlite3.IntegrityError:
            pass  # Already a member
        conn.close()
    
    def remove_channel_member(self, channel_id: str, user_id: str) -> None:
        conn = self._get_conn()
        conn.execute("DELETE FROM channel_members WHERE channel_id = ? AND user_id = ?", 
                    (channel_id, user_id))
        conn.commit()
        conn.close()
    
    def get_channel_members(self, channel_id: str) -> List[User]:
        conn = self._get_conn()
        results = conn.execute("""
            SELECT u.* FROM users u
            JOIN channel_members cm ON u.id = cm.user_id
            WHERE cm.channel_id = ?
        """, (channel_id,)).fetchall()
        conn.close()
        return [self._row_to_user(r) for r in results]
    
    # ============ Direct Messages ============
    
    def get_or_create_dm(self, org_id: str, user1_id: str, user2_id: str) -> Dict[str, Any]:
        sorted_ids = sorted([user1_id, user2_id])
        participant_ids_json = json.dumps(sorted_ids)
        
        conn = self._get_conn()
        result = conn.execute(
            "SELECT * FROM dm_conversations WHERE org_id = ? AND participant_ids = ?",
            (org_id, participant_ids_json)
        ).fetchone()
        
        if result:
            result["participant_ids"] = json.loads(result["participant_ids"])
            conn.close()
            return result
        
        dm_id = self._gen_id()
        conn.execute("""
            INSERT INTO dm_conversations (id, org_id, participant_ids, created_at)
            VALUES (?, ?, ?, ?)
        """, (dm_id, org_id, participant_ids_json, self._now()))
        conn.commit()
        
        result = conn.execute("SELECT * FROM dm_conversations WHERE id = ?", (dm_id,)).fetchone()
        result["participant_ids"] = json.loads(result["participant_ids"])
        conn.close()
        return result
    
    def get_user_dms(self, user_id: str, org_id: str) -> List[Dict[str, Any]]:
        conn = self._get_conn()
        results = conn.execute(
            "SELECT * FROM dm_conversations WHERE org_id = ?", (org_id,)
        ).fetchall()
        conn.close()
        
        user_dms = []
        for r in results:
            r["participant_ids"] = json.loads(r["participant_ids"])
            if user_id in r["participant_ids"]:
                user_dms.append(r)
        return user_dms
    
    # ============ Messages ============
    
    def create_message(self, message: MessageCreate, org_id: str, sender_id: str, is_from_agent: bool = False) -> Message:
        msg_id = self._gen_id()
        conn = self._get_conn()
        conn.execute("""
            INSERT INTO messages (id, org_id, channel_id, sender_id, content, message_type, is_from_agent, parent_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (msg_id, org_id, message.channel_id, sender_id, message.content, 
              message.message_type.value, int(is_from_agent), message.parent_id, self._now()))
        conn.commit()
        result = conn.execute("SELECT * FROM messages WHERE id = ?", (msg_id,)).fetchone()
        conn.close()
        return Message(**result)
    
    def create_dm_message(self, dm_id: str, org_id: str, sender_id: str, content: str, is_from_agent: bool = False) -> Message:
        msg_id = self._gen_id()
        conn = self._get_conn()
        conn.execute("""
            INSERT INTO messages (id, org_id, dm_conversation_id, sender_id, content, message_type, is_from_agent, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (msg_id, org_id, dm_id, sender_id, content, MessageType.TEXT.value, int(is_from_agent), self._now()))
        conn.commit()
        result = conn.execute("SELECT * FROM messages WHERE id = ?", (msg_id,)).fetchone()
        conn.close()
        return Message(**result)
    
    def get_channel_messages(self, channel_id: str, limit: int = 50, before: Optional[str] = None) -> List[Dict[str, Any]]:
        conn = self._get_conn()
        query = """
            SELECT m.*, u.id as sender_id, u.name as sender_name, u.email as sender_email, 
                   u.avatar_url as sender_avatar_url, u.role as sender_role
            FROM messages m
            LEFT JOIN users u ON m.sender_id = u.id
            WHERE m.channel_id = ?
        """
        params = [channel_id]
        
        if before:
            query += " AND m.created_at < ?"
            params.append(before)
        
        query += " ORDER BY m.created_at DESC LIMIT ?"
        params.append(limit)
        
        results = conn.execute(query, params).fetchall()
        conn.close()
        
        # Format with nested sender
        formatted = []
        for r in reversed(results):
            msg = dict(r)
            msg["sender"] = {
                "id": r["sender_id"],
                "name": r["sender_name"],
                "email": r["sender_email"],
                "avatar_url": r["sender_avatar_url"],
                "role": r["sender_role"]
            }
            formatted.append(msg)
        return formatted
    
    def get_dm_messages(self, dm_id: str, limit: int = 50, before: Optional[str] = None) -> List[Dict[str, Any]]:
        conn = self._get_conn()
        query = """
            SELECT m.*, u.id as sender_id, u.name as sender_name, u.email as sender_email,
                   u.avatar_url as sender_avatar_url, u.role as sender_role
            FROM messages m
            LEFT JOIN users u ON m.sender_id = u.id
            WHERE m.dm_conversation_id = ?
        """
        params = [dm_id]
        
        if before:
            query += " AND m.created_at < ?"
            params.append(before)
        
        query += " ORDER BY m.created_at DESC LIMIT ?"
        params.append(limit)
        
        results = conn.execute(query, params).fetchall()
        conn.close()
        
        formatted = []
        for r in reversed(results):
            msg = dict(r)
            msg["sender"] = {
                "id": r["sender_id"],
                "name": r["sender_name"],
                "email": r["sender_email"],
                "avatar_url": r["sender_avatar_url"],
                "role": r["sender_role"]
            }
            formatted.append(msg)
        return formatted
    
    # ============ Requests ============
    
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
        request_id = self._gen_id()
        conn = self._get_conn()
        conn.execute("""
            INSERT INTO requests (id, org_id, from_user_id, to_user_id, to_team_id, subject, content, status, priority, due_date, follow_up_count, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (request_id, org_id, from_user_id, to_user_id, to_team_id, subject, content,
              RequestStatus.PENDING.value, priority.value, due_date.isoformat() if due_date else None, 0, self._now()))
        conn.commit()
        
        # Create task for recipient
        if to_user_id:
            from_user = self.get_user(from_user_id)
            self.create_task(
                user_id=to_user_id,
                request_id=request_id,
                title=f"Request from {from_user.name if from_user else 'Unknown'}",
                description=content,
                priority=priority,
                due_date=due_date
            )
        
        result = conn.execute("SELECT * FROM requests WHERE id = ?", (request_id,)).fetchone()
        conn.close()
        return Request(**result)
    
    def get_request(self, request_id: str) -> Optional[Request]:
        conn = self._get_conn()
        result = conn.execute("SELECT * FROM requests WHERE id = ?", (request_id,)).fetchone()
        conn.close()
        return Request(**result) if result else None
    
    def get_user_outgoing_requests(self, user_id: str) -> List[Request]:
        conn = self._get_conn()
        results = conn.execute(
            "SELECT * FROM requests WHERE from_user_id = ? ORDER BY created_at DESC", 
            (user_id,)
        ).fetchall()
        conn.close()
        return [Request(**r) for r in results]
    
    def get_user_incoming_requests(self, user_id: str) -> List[Request]:
        conn = self._get_conn()
        results = conn.execute(
            "SELECT * FROM requests WHERE to_user_id = ? ORDER BY created_at DESC",
            (user_id,)
        ).fetchall()
        conn.close()
        return [Request(**r) for r in results]
    
    def update_request(self, request_id: str, updates: Dict[str, Any]) -> Request:
        conn = self._get_conn()
        set_clause = ", ".join(f"{k} = ?" for k in updates.keys())
        values = list(updates.values()) + [request_id]
        conn.execute(f"UPDATE requests SET {set_clause} WHERE id = ?", values)
        conn.commit()
        result = conn.execute("SELECT * FROM requests WHERE id = ?", (request_id,)).fetchone()
        conn.close()
        return Request(**result)
    
    def complete_request(self, request_id: str, response: str) -> Request:
        return self.update_request(request_id, {
            "status": RequestStatus.COMPLETED.value,
            "response": response,
            "completed_at": self._now()
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
        task_id = self._gen_id()
        conn = self._get_conn()
        conn.execute("""
            INSERT INTO tasks (id, user_id, request_id, title, description, status, priority, due_date, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (task_id, user_id, request_id, title, description, RequestStatus.PENDING.value,
              priority.value, due_date.isoformat() if due_date else None, self._now()))
        conn.commit()
        result = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        conn.close()
        return Task(**result)
    
    def get_user_tasks(self, user_id: str, status: Optional[RequestStatus] = None) -> List[Task]:
        conn = self._get_conn()
        if status:
            results = conn.execute(
                "SELECT * FROM tasks WHERE user_id = ? AND status = ? ORDER BY created_at DESC",
                (user_id, status.value)
            ).fetchall()
        else:
            results = conn.execute(
                "SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at DESC",
                (user_id,)
            ).fetchall()
        conn.close()
        return [Task(**r) for r in results]
    
    def update_task(self, task_id: str, updates: Dict[str, Any]) -> Task:
        conn = self._get_conn()
        set_clause = ", ".join(f"{k} = ?" for k in updates.keys())
        values = list(updates.values()) + [task_id]
        conn.execute(f"UPDATE tasks SET {set_clause} WHERE id = ?", values)
        conn.commit()
        result = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        conn.close()
        return Task(**result)
    
    def complete_task(self, task_id: str) -> Task:
        return self.update_task(task_id, {
            "status": RequestStatus.COMPLETED.value,
            "completed_at": self._now()
        })
    
    # ============ Notifications ============
    
    def create_notification(self, user_id: str, title: str, body: str, link: Optional[str] = None) -> Dict[str, Any]:
        notif_id = self._gen_id()
        conn = self._get_conn()
        conn.execute("""
            INSERT INTO notifications (id, user_id, title, body, link, is_read, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (notif_id, user_id, title, body, link, 0, self._now()))
        conn.commit()
        result = conn.execute("SELECT * FROM notifications WHERE id = ?", (notif_id,)).fetchone()
        conn.close()
        return result
    
    def get_user_notifications(self, user_id: str, unread_only: bool = False) -> List[Dict[str, Any]]:
        conn = self._get_conn()
        if unread_only:
            results = conn.execute(
                "SELECT * FROM notifications WHERE user_id = ? AND is_read = 0 ORDER BY created_at DESC LIMIT 50",
                (user_id,)
            ).fetchall()
        else:
            results = conn.execute(
                "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50",
                (user_id,)
            ).fetchall()
        conn.close()
        return results
    
    def mark_notification_read(self, notification_id: str) -> None:
        conn = self._get_conn()
        conn.execute("UPDATE notifications SET is_read = 1 WHERE id = ?", (notification_id,))
        conn.commit()
        conn.close()
    
    def mark_all_notifications_read(self, user_id: str) -> None:
        conn = self._get_conn()
        conn.execute("UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0", (user_id,))
        conn.commit()
        conn.close()


# Singleton instance
_local_db_service: Optional[LocalDatabaseService] = None


def get_local_database() -> LocalDatabaseService:
    global _local_db_service
    if _local_db_service is None:
        _local_db_service = LocalDatabaseService()
    return _local_db_service
