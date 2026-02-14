"""
Authentication API routes
"""
from fastapi import APIRouter, Depends, HTTPException, status
from typing import Optional

from ..models.schemas import UserCreate, UserLogin, UserWithToken, User
from ..services.auth import get_auth_service, AuthService, get_current_user

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/signup", response_model=UserWithToken)
async def signup(
    user_data: UserCreate,
    auth: AuthService = Depends(get_auth_service)
):
    """Register a new user"""
    return auth.sign_up(
        email=user_data.email,
        password=user_data.password,
        name=user_data.name,
        role=user_data.role
    )


@router.post("/login", response_model=UserWithToken)
async def login(
    credentials: UserLogin,
    auth: AuthService = Depends(get_auth_service)
):
    """Sign in with email and password"""
    return auth.sign_in(
        email=credentials.email,
        password=credentials.password
    )


@router.post("/logout")
async def logout(
    user: User = Depends(get_current_user),
    auth: AuthService = Depends(get_auth_service)
):
    """Sign out current user"""
    auth.sign_out("")
    return {"message": "Logged out successfully"}


@router.get("/me", response_model=User)
async def get_me(user: User = Depends(get_current_user)):
    """Get current user profile"""
    return user


@router.post("/refresh")
async def refresh_token(
    refresh_token: str,
    auth: AuthService = Depends(get_auth_service)
):
    """Refresh access token"""
    return auth.refresh_token(refresh_token)
