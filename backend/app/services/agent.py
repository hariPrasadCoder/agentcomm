"""
AI Agent Service - Handles intelligent routing, requests, and communication
Uses Claude SDK for AI capabilities
"""
import anthropic
from openai import OpenAI
from typing import Optional, Dict, Any, List
import json
import re

from ..config import get_settings
from ..models.schemas import (
    User, Request, RequestPriority, RequestStatus,
    AgentChatRequest, AgentChatResponse
)
from .database import DatabaseService, get_database


SYSTEM_PROMPTS = {
    "router": """You are a communication routing agent for an enterprise team. Your job is to analyze requests and determine WHO should handle them based on organizational context.

Given a user's message and organizational context (teams, users, their roles and expertise), determine:
1. Which person or team is best suited to handle this request
2. Why they're the right choice
3. How to formulate a clear, actionable request

Always respond in JSON format:
{
  "target_user_id": "user id or null if unknown",
  "target_team_id": "team id or null",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation of why this target",
  "formatted_request": "clear, professional version of the request",
  "subject": "short subject line (max 60 chars)"
}

If you cannot determine a specific target, set confidence to 0 and explain in reasoning.""",

    "classifier": """You are a message intent classifier. Analyze the user's message and classify their intent.

Respond with JSON only:
{
  "intent": "request" | "status" | "tasks" | "respond" | "general",
  "task_number": null or number if responding to a specific task,
  "details": "any relevant details"
}

Intent types:
- "request": User wants something from someone else (needs routing to another person)
- "status": User asking about status of their outgoing requests
- "tasks": User asking what they need to do / their task queue
- "respond": User responding to a task in their queue (often starts with a number)
- "general": General question, chat, or information request""",

    "responder": """You are a helpful AI communication assistant. You help users by:
1. Understanding their requests and routing them to the right people
2. Tracking requests and following up automatically
3. Managing their task queue
4. Answering general questions about their team and work

Be concise, professional, and proactive. Use a friendly but efficient tone.
If you take an action, clearly state what you did.
If you need clarification, ask specific questions.""",

    "follow_up": """Generate a polite but professional follow-up message for a pending request.
Keep it brief and action-oriented. Include:
- Brief context about the original request
- Clear ask for an update or response
- Offer to help if there are blockers"""
}


class AgentService:
    def __init__(self, db: DatabaseService):
        self.db = db
        settings = get_settings()
        
        self.provider = settings.default_provider
        self.model = settings.default_model
        
        if settings.anthropic_api_key:
            self.anthropic = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        else:
            self.anthropic = None
            
        if settings.openai_api_key:
            self.openai = OpenAI(api_key=settings.openai_api_key)
        else:
            self.openai = None
    
    async def chat(
        self,
        messages: List[Dict[str, str]],
        system_prompt: Optional[str] = None
    ) -> str:
        """Send messages to the LLM and get a response"""
        if self.provider == "anthropic" and self.anthropic:
            return await self._chat_anthropic(messages, system_prompt)
        elif self.provider == "openai" and self.openai:
            return await self._chat_openai(messages, system_prompt)
        else:
            raise ValueError("No AI provider configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.")
    
    async def _chat_anthropic(self, messages: List[Dict[str, str]], system_prompt: Optional[str]) -> str:
        # Filter out system messages (Anthropic uses separate system param)
        user_messages = [m for m in messages if m["role"] != "system"]
        
        response = self.anthropic.messages.create(
            model=self.model,
            max_tokens=2048,
            system=system_prompt or "",
            messages=user_messages
        )
        
        return response.content[0].text
    
    async def _chat_openai(self, messages: List[Dict[str, str]], system_prompt: Optional[str]) -> str:
        all_messages = []
        if system_prompt:
            all_messages.append({"role": "system", "content": system_prompt})
        all_messages.extend(messages)
        
        response = self.openai.chat.completions.create(
            model=self.model,
            messages=all_messages
        )
        
        return response.choices[0].message.content
    
    async def handle_user_message(
        self,
        user: User,
        message: str,
        org_id: str
    ) -> AgentChatResponse:
        """Main entry point: handle a message from a user"""
        
        # First, classify the intent
        intent = await self._classify_intent(user, message)
        
        if intent["intent"] == "request":
            return await self._handle_request(user, message, org_id)
        elif intent["intent"] == "status":
            return await self._handle_status(user)
        elif intent["intent"] == "tasks":
            return await self._handle_tasks(user)
        elif intent["intent"] == "respond":
            return await self._handle_respond(user, message, intent.get("task_number"))
        else:
            return await self._handle_general(user, message, org_id)
    
    async def _classify_intent(self, user: User, message: str) -> Dict[str, Any]:
        """Classify what the user is trying to do"""
        # Get context about user's pending items
        tasks = self.db.get_user_tasks(user.id, RequestStatus.PENDING)
        requests = self.db.get_user_outgoing_requests(user.id)
        active_requests = [r for r in requests if r.status not in [RequestStatus.COMPLETED, RequestStatus.CANCELLED]]
        
        context = f"""
User has {len(tasks)} pending tasks in their queue.
User has {len(active_requests)} active outgoing requests.
"""
        
        response = await self.chat([
            {"role": "user", "content": f"Message to classify:\n\"{message}\"\n\nContext:\n{context}"}
        ], SYSTEM_PROMPTS["classifier"])
        
        try:
            return json.loads(response)
        except json.JSONDecodeError:
            return {"intent": "general", "details": "Failed to parse classification"}
    
    async def _handle_request(self, user: User, message: str, org_id: str) -> AgentChatResponse:
        """Handle a new request - route it to the right person"""
        # Get org context for routing
        users = self.db.get_org_users(org_id)
        teams = self.db.get_org_teams(org_id)
        
        org_context = {
            "users": [
                {"id": u.id, "name": u.name, "role": u.role, "team_id": u.team_id}
                for u in users if u.id != user.id
            ],
            "teams": [
                {"id": t.id, "name": t.name, "description": t.description}
                for t in teams
            ]
        }
        
        # Route the request
        routing_prompt = f"""
Route this request from {user.name} ({user.role or 'team member'}):

"{message}"

Organizational context:
{json.dumps(org_context, indent=2)}
"""
        
        response = await self.chat([
            {"role": "user", "content": routing_prompt}
        ], SYSTEM_PROMPTS["router"])
        
        try:
            routing = json.loads(response)
        except json.JSONDecodeError:
            return AgentChatResponse(
                response="I had trouble understanding how to route this request. Could you tell me specifically who you'd like me to send this to?",
                action_taken=None
            )
        
        # Check if we found a target
        if not routing.get("target_user_id") and not routing.get("target_team_id"):
            return AgentChatResponse(
                response=f"I couldn't determine who should handle this. {routing.get('reasoning', '')}\n\nCould you tell me who to ask, or which team this is for?",
                action_taken=None
            )
        
        # Find target user
        target_user = None
        if routing.get("target_user_id"):
            target_user = self.db.get_user(routing["target_user_id"])
        elif routing.get("target_team_id"):
            team_users = self.db.get_team_users(routing["target_team_id"])
            if team_users:
                target_user = team_users[0]  # Pick first team member
        
        if not target_user:
            return AgentChatResponse(
                response="I found a potential match but couldn't locate the specific person. Could you help me identify who to ask?",
                action_taken=None
            )
        
        # Create the request
        request = self.db.create_request(
            org_id=org_id,
            from_user_id=user.id,
            to_user_id=target_user.id,
            to_team_id=routing.get("target_team_id"),
            subject=routing.get("subject", message[:60]),
            content=routing.get("formatted_request", message),
            priority=RequestPriority.NORMAL
        )
        
        # Create notification for recipient
        self.db.create_notification(
            user_id=target_user.id,
            title=f"Request from {user.name}",
            body=routing.get("formatted_request", message)[:100],
            link=f"/tasks"
        )
        
        return AgentChatResponse(
            response=f"✅ I've sent your request to **{target_user.name}**.\n\n**Request:** {routing.get('formatted_request', message)}\n\nI'll track this and follow up if needed. You can check status anytime by asking me.",
            action_taken="request_created",
            request_created=request
        )
    
    async def _handle_status(self, user: User) -> AgentChatResponse:
        """Show user their outgoing requests status"""
        requests = self.db.get_user_outgoing_requests(user.id)
        active = [r for r in requests if r.status not in [RequestStatus.COMPLETED, RequestStatus.CANCELLED]]
        
        if not active:
            return AgentChatResponse(
                response="You don't have any active outgoing requests. Need to send one?",
                action_taken=None
            )
        
        status_lines = []
        for r in active[:10]:
            target = self.db.get_user(r.to_user_id) if r.to_user_id else None
            target_name = target.name if target else "Unknown"
            status_emoji = {
                "pending": "⏳",
                "in_progress": "🔄",
                "waiting_response": "💬"
            }.get(r.status.value, "📋")
            status_lines.append(f"{status_emoji} **{r.subject}** → {target_name} ({r.status.value})")
        
        return AgentChatResponse(
            response=f"**Your Active Requests ({len(active)}):**\n\n" + "\n".join(status_lines),
            action_taken=None
        )
    
    async def _handle_tasks(self, user: User) -> AgentChatResponse:
        """Show user their task queue"""
        tasks = self.db.get_user_tasks(user.id, RequestStatus.PENDING)
        
        if not tasks:
            return AgentChatResponse(
                response="🎉 No pending tasks! You're all caught up.",
                action_taken=None
            )
        
        task_lines = []
        for i, task in enumerate(tasks[:10], 1):
            request = self.db.get_request(task.request_id)
            from_user = self.db.get_user(request.from_user_id) if request else None
            from_name = from_user.name if from_user else "Unknown"
            
            priority_emoji = {
                "urgent": "🔴",
                "high": "🟠",
                "normal": "🔵",
                "low": "⚪"
            }.get(task.priority.value, "📋")
            
            task_lines.append(f"{i}. {priority_emoji} **{task.title}** (from {from_name})\n   {task.description[:100]}{'...' if len(task.description) > 100 else ''}")
        
        return AgentChatResponse(
            response=f"**Your Task Queue ({len(tasks)}):**\n\n" + "\n\n".join(task_lines) + "\n\n*Reply with a number to respond to that task.*",
            action_taken=None
        )
    
    async def _handle_respond(self, user: User, message: str, task_number: Optional[int]) -> AgentChatResponse:
        """Handle user responding to a task"""
        tasks = self.db.get_user_tasks(user.id, RequestStatus.PENDING)
        
        if not tasks:
            return AgentChatResponse(
                response="You don't have any pending tasks to respond to.",
                action_taken=None
            )
        
        # Try to extract task number from message if not provided
        if task_number is None:
            match = re.match(r'^(\d+)[.:\s]', message)
            if match:
                task_number = int(match.group(1))
        
        # Default to first task if no number specified
        idx = (task_number - 1) if task_number else 0
        if idx < 0 or idx >= len(tasks):
            return AgentChatResponse(
                response=f"Task {task_number} not found. You have {len(tasks)} pending tasks. Use 'tasks' to see them.",
                action_taken=None
            )
        
        task = tasks[idx]
        request = self.db.get_request(task.request_id)
        
        if not request:
            return AgentChatResponse(
                response="Couldn't find the associated request. Please try again.",
                action_taken=None
            )
        
        # Clean the response (remove number prefix if present)
        clean_response = re.sub(r'^\d+[.:\s]+', '', message).strip()
        
        # Complete the request
        self.db.complete_request(request.id, clean_response)
        self.db.complete_task(task.id)
        
        # Notify the requester
        requester = self.db.get_user(request.from_user_id)
        if requester:
            self.db.create_notification(
                user_id=requester.id,
                title=f"Response from {user.name}",
                body=clean_response[:100],
                link=f"/requests"
            )
        
        return AgentChatResponse(
            response=f"✅ Response sent to {requester.name if requester else 'requester'}!\n\n**Your response:** \"{clean_response}\"",
            action_taken="task_completed"
        )
    
    async def _handle_general(self, user: User, message: str, org_id: str) -> AgentChatResponse:
        """Handle general queries and conversation"""
        # Get some context
        users = self.db.get_org_users(org_id)
        teams = self.db.get_org_teams(org_id)
        
        context = f"""
You're helping {user.name} ({user.role or 'team member'}).

Team members: {', '.join([u.name for u in users[:10]])}
Teams: {', '.join([t.name for t in teams])}
"""
        
        response = await self.chat([
            {"role": "user", "content": f"{context}\n\nUser message: {message}"}
        ], SYSTEM_PROMPTS["responder"])
        
        return AgentChatResponse(
            response=response,
            action_taken=None
        )
    
    async def generate_follow_up(self, request: Request, from_user: User) -> str:
        """Generate a follow-up message for a stale request"""
        days_waiting = (datetime.utcnow() - request.created_at).days if hasattr(request, 'created_at') else 0
        
        prompt = f"""Generate a follow-up for this pending request:

Subject: {request.subject}
Original request: {request.content}
Days waiting: {days_waiting}
Previous follow-ups: {request.follow_up_count}

From: {from_user.name}"""
        
        response = await self.chat([
            {"role": "user", "content": prompt}
        ], SYSTEM_PROMPTS["follow_up"])
        
        return response


# Singleton
_agent_service: Optional[AgentService] = None


def get_agent_service() -> AgentService:
    global _agent_service
    if _agent_service is None:
        _agent_service = AgentService(get_database())
    return _agent_service
