from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.features.auth.dependencies import require_roles
from app.features.auth.models import User
from app.features.settings.schemas import SettingsResponse, SettingsUpdate
from app.features.settings.service import SettingsService

router = APIRouter()
OwnerUser = Annotated[User, Depends(require_roles(["owner"]))]
DbSession = Annotated[Session, Depends(get_db)]


@router.get("/settings", response_model=SettingsResponse)
def get_settings(current_user: OwnerUser, db: DbSession) -> SettingsResponse:
    return SettingsService(db).get_settings()


@router.patch("/settings", response_model=SettingsResponse)
def update_settings(payload: SettingsUpdate, current_user: OwnerUser, db: DbSession) -> SettingsResponse:
    return SettingsService(db).update_settings(payload, current_user)
