"""
Authentication service using Supabase Auth
"""
from supabase import create_client, Client
from typing import Optional
from datetime import datetime
from fastapi import HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from ..config import get_settings
from ..models.schemas import User, UserCreate, UserWithToken
from .database import get_database, DatabaseService

security = HTTPBearer()


class AuthService:
    def __init__(self):
        settings = get_settings()
        # Use anon key for auth operations (client-side equivalent)
        self.client: Client = create_client(
            settings.supabase_url,
            settings.supabase_key
        )
        self.db = get_database()
    
    def sign_up(self, email: str, password: str, name: str, role: Optional[str] = None) -> UserWithToken:
        """Register a new user"""
        try:
            # Create auth user in Supabase
            auth_response = self.client.auth.sign_up({
                "email": email,
                "password": password
            })
            
            if not auth_response.user:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Failed to create user"
                )
            
            # Create user profile in our database
            user_create = UserCreate(
                email=email,
                name=name,
                role=role,
                password=password  # Not stored, just for schema
            )
            user = self.db.create_user(user_create, auth_response.user.id)
            
            return UserWithToken(
                **user.model_dump(),
                access_token=auth_response.session.access_token if auth_response.session else ""
            )
        except Exception as e:
            if "already registered" in str(e).lower():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Email already registered"
                )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e)
            )
    
    def sign_in(self, email: str, password: str) -> UserWithToken:
        """Sign in an existing user"""
        try:
            auth_response = self.client.auth.sign_in_with_password({
                "email": email,
                "password": password
            })
            
            if not auth_response.user or not auth_response.session:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid credentials"
                )
            
            # Get user profile
            user = self.db.get_user(auth_response.user.id)
            if not user:
                # Create profile if missing (shouldn't happen normally)
                user = self.db.create_user(
                    UserCreate(email=email, name=email.split("@")[0], password=password),
                    auth_response.user.id
                )
            
            return UserWithToken(
                **user.model_dump(),
                access_token=auth_response.session.access_token
            )
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials"
            )
    
    def sign_out(self, token: str) -> None:
        """Sign out a user"""
        try:
            self.client.auth.sign_out()
        except Exception:
            pass  # Ignore sign out errors
    
    def get_user_from_token(self, token: str) -> User:
        """Validate token and return user"""
        try:
            # Verify token with Supabase
            user_response = self.client.auth.get_user(token)
            
            if not user_response.user:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid or expired token"
                )
            
            # Get user profile
            user = self.db.get_user(user_response.user.id)
            if not user:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="User profile not found"
                )
            
            return user
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token"
            )
    
    def refresh_token(self, refresh_token: str) -> dict:
        """Refresh access token"""
        try:
            response = self.client.auth.refresh_session(refresh_token)
            if not response.session:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Failed to refresh token"
                )
            return {
                "access_token": response.session.access_token,
                "refresh_token": response.session.refresh_token,
                "expires_at": response.session.expires_at
            }
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Failed to refresh token"
            )


# Singleton
_auth_service: Optional[AuthService] = None


def get_auth_service() -> AuthService:
    global _auth_service
    if _auth_service is None:
        _auth_service = AuthService()
    return _auth_service


# Dependency for protected routes
async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> User:
    """FastAPI dependency to get current authenticated user"""
    auth = get_auth_service()
    return auth.get_user_from_token(credentials.credentials)


# Dependency for routes that need org context
async def get_current_user_with_org(
    user: User = Depends(get_current_user)
) -> User:
    """FastAPI dependency that ensures user has an organization"""
    if not user.org_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User must belong to an organization"
        )
    return user
