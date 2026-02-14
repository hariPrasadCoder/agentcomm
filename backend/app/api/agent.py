"""
AI Agent API routes
"""
from fastapi import APIRouter, Depends, HTTPException, status

from ..models.schemas import (
    User, AgentChatRequest, AgentChatResponse,
    Request, Task, RequestStatus
)
from ..services.auth import get_current_user
from ..services.agent import get_agent_service, AgentService
from ..services.database import get_database, DatabaseService

router = APIRouter(prefix="/agent", tags=["AI Agent"])


@router.post("/chat", response_model=AgentChatResponse)
async def chat_with_agent(
    request: AgentChatRequest,
    user: User = Depends(get_current_user),
    agent: AgentService = Depends(get_agent_service)
):
    """Chat with your AI agent - it can route requests, check status, and manage tasks"""
    if not user.org_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User must belong to an organization to use the agent"
        )
    
    return await agent.handle_user_message(user, request.message, user.org_id)


@router.get("/requests", response_model=list[Request])
async def get_my_requests(
    status_filter: RequestStatus = None,
    user: User = Depends(get_current_user),
    db: DatabaseService = Depends(get_database)
):
    """Get all outgoing requests (things you asked for)"""
    requests = db.get_user_outgoing_requests(user.id)
    if status_filter:
        requests = [r for r in requests if r.status == status_filter]
    return requests


@router.get("/tasks", response_model=list[Task])
async def get_my_tasks(
    status_filter: RequestStatus = None,
    user: User = Depends(get_current_user),
    db: DatabaseService = Depends(get_database)
):
    """Get all tasks in your queue (things others asked of you)"""
    return db.get_user_tasks(user.id, status_filter)


@router.post("/tasks/{task_id}/complete")
async def complete_task(
    task_id: str,
    response: str,
    user: User = Depends(get_current_user),
    db: DatabaseService = Depends(get_database)
):
    """Complete a task with a response"""
    tasks = db.get_user_tasks(user.id, RequestStatus.PENDING)
    task = next((t for t in tasks if t.id == task_id), None)
    
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )
    
    # Complete the task and request
    db.complete_task(task_id)
    
    request = db.get_request(task.request_id)
    if request:
        db.complete_request(request.id, response)
        
        # Notify requester
        db.create_notification(
            user_id=request.from_user_id,
            title=f"Response from {user.name}",
            body=response[:100],
            link="/requests"
        )
    
    return {"message": "Task completed", "task_id": task_id}
