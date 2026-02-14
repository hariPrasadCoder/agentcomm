"""
Organization API routes
"""
from fastapi import APIRouter, Depends, HTTPException, status
from typing import List

from ..models.schemas import (
    Organization, OrgCreate, OrgJoin, User,
    Team, TeamCreate, TeamWithMembers
)
from ..services.auth import get_current_user
from ..services.database import get_database, DatabaseService

router = APIRouter(prefix="/orgs", tags=["Organizations"])


@router.post("", response_model=Organization)
async def create_organization(
    org_data: OrgCreate,
    user: User = Depends(get_current_user),
    db: DatabaseService = Depends(get_database)
):
    """Create a new organization"""
    if user.org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User already belongs to an organization"
        )
    return db.create_organization(org_data, user.id)


@router.post("/join", response_model=User)
async def join_organization(
    join_data: OrgJoin,
    user: User = Depends(get_current_user),
    db: DatabaseService = Depends(get_database)
):
    """Join an organization with invite code"""
    if user.org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User already belongs to an organization"
        )
    
    org = db.get_org_by_invite_code(join_data.invite_code)
    if not org:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid invite code"
        )
    
    return db.join_organization(user.id, org.id)


@router.get("/current", response_model=Organization)
async def get_current_organization(
    user: User = Depends(get_current_user),
    db: DatabaseService = Depends(get_database)
):
    """Get current user's organization"""
    if not user.org_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User does not belong to an organization"
        )
    
    org = db.get_organization(user.org_id)
    if not org:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found"
        )
    return org


@router.get("/members", response_model=List[User])
async def get_organization_members(
    user: User = Depends(get_current_user),
    db: DatabaseService = Depends(get_database)
):
    """Get all members of current organization"""
    if not user.org_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User must belong to an organization"
        )
    return db.get_org_users(user.org_id)


@router.post("/invite/regenerate")
async def regenerate_invite_code(
    user: User = Depends(get_current_user),
    db: DatabaseService = Depends(get_database)
):
    """Regenerate organization invite code (owner only)"""
    if not user.org_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User must belong to an organization"
        )
    
    org = db.get_organization(user.org_id)
    if not org or org.owner_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only organization owner can regenerate invite code"
        )
    
    new_code = db.regenerate_invite_code(user.org_id)
    return {"invite_code": new_code}


# ============ Teams ============

@router.post("/teams", response_model=Team)
async def create_team(
    team_data: TeamCreate,
    user: User = Depends(get_current_user),
    db: DatabaseService = Depends(get_database)
):
    """Create a new team"""
    if not user.org_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User must belong to an organization"
        )
    return db.create_team(team_data, user.org_id)


@router.get("/teams", response_model=List[Team])
async def get_teams(
    user: User = Depends(get_current_user),
    db: DatabaseService = Depends(get_database)
):
    """Get all teams in organization"""
    if not user.org_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User must belong to an organization"
        )
    return db.get_org_teams(user.org_id)


@router.get("/teams/{team_id}", response_model=TeamWithMembers)
async def get_team(
    team_id: str,
    user: User = Depends(get_current_user),
    db: DatabaseService = Depends(get_database)
):
    """Get team details with members"""
    team = db.get_team(team_id)
    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found"
        )
    
    members = db.get_team_users(team_id)
    return TeamWithMembers(**team.model_dump(), members=members)


@router.post("/teams/{team_id}/join")
async def join_team(
    team_id: str,
    user: User = Depends(get_current_user),
    db: DatabaseService = Depends(get_database)
):
    """Join a team"""
    team = db.get_team(team_id)
    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found"
        )
    
    updated_user = db.add_user_to_team(user.id, team_id)
    return {"message": f"Joined team {team.name}", "user": updated_user}
