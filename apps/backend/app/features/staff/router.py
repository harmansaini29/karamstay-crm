from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.features.auth.dependencies import require_roles
from app.features.auth.models import User
from app.features.staff.schemas import StaffCreate, StaffResponse, StaffUpdate
from app.features.staff.service import StaffService

router = APIRouter()
OwnerUser = Annotated[User, Depends(require_roles(["owner"]))]
DbSession = Annotated[Session, Depends(get_db)]


@router.get("/staff", response_model=list[StaffResponse])
def list_staff(current_user: OwnerUser, db: DbSession) -> list[StaffResponse]:
    return StaffService(db).list_staff()


@router.post("/staff", response_model=StaffResponse, status_code=status.HTTP_201_CREATED)
def create_staff(payload: StaffCreate, current_user: OwnerUser, db: DbSession) -> StaffResponse:
    return StaffService(db).create_staff(payload)


@router.patch("/staff/{staff_id}", response_model=StaffResponse)
def update_staff(
    staff_id: int,
    payload: StaffUpdate,
    current_user: OwnerUser,
    db: DbSession,
) -> StaffResponse:
    return StaffService(db).update_staff(staff_id, payload)


@router.delete("/staff/{staff_id}")
def delete_staff(staff_id: int, current_user: OwnerUser, db: DbSession) -> dict[str, str]:
    return StaffService(db).delete_staff(staff_id)
