"""
Authentication service - supports both local (JWT) and Supabase modes
"""
from typing import Optional
from datetime import datetime, timedelta
from fastapi import HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from passlib.context import CryptContext

from ..config import get_settings
from ..models.schemas import User, UserCreate, UserWithToken

security = HTTPBearer()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class AuthService:
    def __init__(self):
        self.settings = get_settings()
        self.is_local = self.settings.db_mode == "local"
        
        if self.is_local:
            from .database_local import get_local_database
            self.db = get_local_database()
        else:
            from .database import get_database
            self.db = get_database()
            # Also init Supabase client for auth
            from supabase import create_client
            self.supabase = create_client(
                self.settings.supabase_url,
                self.settings.supabase_key
            )
    
    def _hash_password(self, password: str) -> str:
        return pwd_context.hash(password)
    
    def _verify_password(self, plain: str, hashed: str) -> bool:
        return pwd_context.verify(plain, hashed)
    
    def _create_token(self, user_id: str) -> str:
        expire = datetime.utcnow() + timedelta(hours=self.settings.jwt_expiry_hours)
        payload = {"sub": user_id, "exp": expire}
        return jwt.encode(payload, self.settings.jwt_secret, algorithm=self.settings.jwt_algorithm)
    
    def _decode_token(self, token: str) -> str:
        """Decode token and return user_id"""
        try:
            payload = jwt.decode(token, self.settings.jwt_secret, algorithms=[self.settings.jwt_algorithm])
            user_id = payload.get("sub")
            if not user_id:
                raise HTTPException(status_code=401, detail="Invalid token")
            return user_id
        except JWTError:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
    
    def sign_up(self, email: str, password: str, name: str, role: Optional[str] = None) -> UserWithToken:
        """Register a new user"""
        if self.is_local:
            return self._local_signup(email, password, name, role)
        else:
            return self._supabase_signup(email, password, name, role)
    
    def _local_signup(self, email: str, password: str, name: str, role: Optional[str]) -> UserWithToken:
        # Check if user exists
        existing = self.db.get_user_by_email(email)
        if existing:
            raise HTTPException(status_code=400, detail="Email already registered")
        
        # Create user
        password_hash = self._hash_password(password)
        user_create = UserCreate(email=email, name=name, role=role, password=password)
        user = self.db.create_user(user_create, password_hash)
        
        # Generate token
        token = self._create_token(user.id)
        
        return UserWithToken(**user.model_dump(), access_token=token)
    
    def _supabase_signup(self, email: str, password: str, name: str, role: Optional[str]) -> UserWithToken:
        try:
            auth_response = self.supabase.auth.sign_up({
                "email": email,
                "password": password
            })
            
            if not auth_response.user:
                raise HTTPException(status_code=400, detail="Failed to create user")
            
            # Create user profile
            user_create = UserCreate(email=email, name=name, role=role, password=password)
            user = self.db.create_user(user_create, auth_response.user.id)
            
            return UserWithToken(
                **user.model_dump(),
                access_token=auth_response.session.access_token if auth_response.session else ""
            )
        except Exception as e:
            if "already registered" in str(e).lower():
                raise HTTPException(status_code=400, detail="Email already registered")
            raise HTTPException(status_code=400, detail=str(e))
    
    def sign_in(self, email: str, password: str) -> UserWithToken:
        """Sign in an existing user"""
        if self.is_local:
            return self._local_signin(email, password)
        else:
            return self._supabase_signin(email, password)
    
    def _local_signin(self, email: str, password: str) -> UserWithToken:
        user_data = self.db.get_user_by_email(email)
        if not user_data:
            raise HTTPException(status_code=401, detail="Invalid credentials")
        
        if not self._verify_password(password, user_data["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid credentials")
        
        user = self.db.get_user(user_data["id"])
        token = self._create_token(user.id)
        
        return UserWithToken(**user.model_dump(), access_token=token)
    
    def _supabase_signin(self, email: str, password: str) -> UserWithToken:
        try:
            auth_response = self.supabase.auth.sign_in_with_password({
                "email": email,
                "password": password
            })
            
            if not auth_response.user or not auth_response.session:
                raise HTTPException(status_code=401, detail="Invalid credentials")
            
            user = self.db.get_user(auth_response.user.id)
            if not user:
                user = self.db.create_user(
                    UserCreate(email=email, name=email.split("@")[0], password=password),
                    auth_response.user.id
                )
            
            return UserWithToken(**user.model_dump(), access_token=auth_response.session.access_token)
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(status_code=401, detail="Invalid credentials")
    
    def sign_out(self, token: str) -> None:
        """Sign out a user"""
        if not self.is_local:
            try:
                self.supabase.auth.sign_out()
            except Exception:
                pass
    
    def get_user_from_token(self, token: str) -> User:
        """Validate token and return user"""
        if self.is_local:
            user_id = self._decode_token(token)
            user = self.db.get_user(user_id)
            if not user:
                raise HTTPException(status_code=404, detail="User not found")
            return user
        else:
            try:
                user_response = self.supabase.auth.get_user(token)
                if not user_response.user:
                    raise HTTPException(status_code=401, detail="Invalid token")
                
                user = self.db.get_user(user_response.user.id)
                if not user:
                    raise HTTPException(status_code=404, detail="User profile not found")
                return user
            except HTTPException:
                raise
            except Exception:
                raise HTTPException(status_code=401, detail="Invalid or expired token")


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
