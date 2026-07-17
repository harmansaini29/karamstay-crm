from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.features.auth.dependencies import require_roles
from app.features.auth.models import User
from app.features.maintenance.schemas import (
    MaintenanceTicketCreate,
    MaintenanceTicketResponse,
    MaintenanceTicketUpdate,
)
from app.features.maintenance.service import MaintenanceService

router = APIRouter()
AnyUser = Annotated[User, Depends(require_roles(["owner", "manager", "accountant", "tenant"]))]
CreatorUser = Annotated[User, Depends(require_roles(["owner", "manager", "tenant"]))]
OwnerManagerUser = Annotated[User, Depends(require_roles(["owner", "manager"]))]
DbSession = Annotated[Session, Depends(get_db)]


@router.get("/maintenance-tickets", response_model=list[MaintenanceTicketResponse])
def list_tickets(current_user: AnyUser, db: DbSession) -> list[MaintenanceTicketResponse]:
    return MaintenanceService(db).list_tickets(current_user)


@router.post(
    "/maintenance-tickets",
    response_model=MaintenanceTicketResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_ticket(
    payload: MaintenanceTicketCreate,
    current_user: CreatorUser,
    db: DbSession,
) -> MaintenanceTicketResponse:
    return MaintenanceService(db).create_ticket(payload, current_user)


@router.get("/maintenance-tickets/{ticket_id}", response_model=MaintenanceTicketResponse)
def get_ticket(ticket_id: int, current_user: AnyUser, db: DbSession) -> MaintenanceTicketResponse:
    return MaintenanceService(db).get_ticket(ticket_id, current_user)


@router.patch("/maintenance-tickets/{ticket_id}", response_model=MaintenanceTicketResponse)
def update_ticket(
    ticket_id: int,
    payload: MaintenanceTicketUpdate,
    current_user: OwnerManagerUser,
    db: DbSession,
) -> MaintenanceTicketResponse:
    return MaintenanceService(db).update_ticket(ticket_id, payload, current_user)
