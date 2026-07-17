from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.features.auth.dependencies import require_roles
from app.features.auth.models import User
from app.features.properties.schemas import (
    BedResponse,
    PropertyCreate,
    PropertyResponse,
    PropertyUpdate,
    UnitCreate,
    UnitResponse,
    UnitUpdate,
)
from app.features.properties.service import PropertyService

router = APIRouter()
OwnerUser = Annotated[User, Depends(require_roles(["owner"]))]
OwnerManagerUser = Annotated[User, Depends(require_roles(["owner", "manager"]))]
DbSession = Annotated[Session, Depends(get_db)]


@router.get("/properties", response_model=list[PropertyResponse])
def list_properties(current_user: OwnerManagerUser, db: DbSession) -> list[PropertyResponse]:
    return PropertyService(db).list_properties(current_user)


@router.post("/properties", response_model=PropertyResponse, status_code=status.HTTP_201_CREATED)
def create_property(
    payload: PropertyCreate,
    current_user: OwnerUser,
    db: DbSession,
) -> PropertyResponse:
    return PropertyService(db).create_property(payload, current_user)


@router.get("/properties/{property_id}", response_model=PropertyResponse)
def get_property(
    property_id: int,
    current_user: OwnerManagerUser,
    db: DbSession,
) -> PropertyResponse:
    return PropertyService(db).get_property_for_user(property_id, current_user)


@router.patch("/properties/{property_id}", response_model=PropertyResponse)
def update_property(
    property_id: int,
    payload: PropertyUpdate,
    current_user: OwnerUser,
    db: DbSession,
) -> PropertyResponse:
    return PropertyService(db).update_property(property_id, payload, current_user)


@router.delete("/properties/{property_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_property(property_id: int, current_user: OwnerUser, db: DbSession) -> Response:
    PropertyService(db).delete_property(property_id, current_user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/properties/{property_id}/units", response_model=list[UnitResponse])
def list_units(
    property_id: int,
    current_user: OwnerManagerUser,
    db: DbSession,
) -> list[UnitResponse]:
    return PropertyService(db).list_units(property_id, current_user)


@router.post(
    "/properties/{property_id}/units",
    response_model=UnitResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_unit(
    property_id: int,
    payload: UnitCreate,
    current_user: OwnerUser,
    db: DbSession,
) -> UnitResponse:
    return PropertyService(db).create_unit(property_id, payload, current_user)


@router.get("/units/{unit_id}", response_model=UnitResponse)
def get_unit(unit_id: int, current_user: OwnerManagerUser, db: DbSession) -> UnitResponse:
    return PropertyService(db).get_unit_for_user(unit_id, current_user)


@router.patch("/units/{unit_id}", response_model=UnitResponse)
def update_unit(
    unit_id: int,
    payload: UnitUpdate,
    current_user: OwnerUser,
    db: DbSession,
) -> UnitResponse:
    return PropertyService(db).update_unit(unit_id, payload, current_user)


@router.delete("/units/{unit_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_unit(unit_id: int, current_user: OwnerUser, db: DbSession) -> Response:
    PropertyService(db).delete_unit(unit_id, current_user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/units/{unit_id}/beds", response_model=list[BedResponse])
def list_beds(unit_id: int, current_user: OwnerManagerUser, db: DbSession) -> list[BedResponse]:
    return PropertyService(db).list_beds(unit_id, current_user)
