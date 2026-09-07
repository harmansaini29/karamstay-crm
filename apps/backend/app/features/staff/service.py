from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session, joinedload

from app.core.security import hash_password
from app.features.auth.models import Role, User
from app.features.properties.models import ManagerPropertyAssignment
from app.features.staff.schemas import StaffCreate, StaffResponse, StaffRole, StaffUpdate


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class StaffService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def _to_response(self, user: User, assigned_properties: list[int] | None = None) -> StaffResponse:
        if assigned_properties is None:
            stmt = select(ManagerPropertyAssignment.property_id).where(
                ManagerPropertyAssignment.manager_id == user.id
            )
            assigned_properties = list(self.db.scalars(stmt).all())

        return StaffResponse(
            id=user.id,
            name=user.name,
            email=user.email,
            phone=user.phone,
            role=StaffRole(id=user.role.id, name=user.role.name),
            is_active=user.is_active,
            assigned_properties=assigned_properties,
            created_at=user.created_at,
        )

    def list_staff(self) -> list[StaffResponse]:
        stmt = (
            select(User)
            .options(joinedload(User.role))
            .join(Role)
            .where(
                Role.name.in_(["manager", "staff", "accountant"]),
                User.deleted_at.is_(None),
            )
            .order_by(User.id.asc())
        )
        users = list(self.db.scalars(stmt).unique().all())

        results: list[StaffResponse] = []
        for u in users:
            results.append(self._to_response(u))
        return results

    def create_staff(self, payload: StaffCreate) -> StaffResponse:
        stmt = select(User).where(User.email == payload.email)
        existing = self.db.scalars(stmt).first()
        if existing and existing.deleted_at is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A user with this email already exists",
            )

        stmt_role = select(Role).where(Role.name == "manager")
        role = self.db.scalars(stmt_role).first()
        if not role:
            stmt_role = select(Role).where(Role.name != "tenant")
            role = self.db.scalars(stmt_role).first()

        if not role:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Staff role not configured in system",
            )

        new_user = User(
            name=payload.name,
            email=payload.email,
            phone=payload.phone,
            password_hash=hash_password(payload.password),
            role_id=role.id,
            is_active=True,
        )
        self.db.add(new_user)
        self.db.flush()

        assigned: list[int] = []
        if payload.assigned_properties:
            for pid in payload.assigned_properties:
                assignment = ManagerPropertyAssignment(manager_id=new_user.id, property_id=pid)
                self.db.add(assignment)
                assigned.append(pid)

        self.db.commit()
        self.db.refresh(new_user)
        return self._to_response(new_user, assigned)

    def update_staff(self, staff_id: int, payload: StaffUpdate) -> StaffResponse:
        stmt = select(User).options(joinedload(User.role)).where(User.id == staff_id, User.deleted_at.is_(None))
        user = self.db.scalars(stmt).first()
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff member not found")

        if payload.name is not None:
            user.name = payload.name
        if payload.phone is not None:
            user.phone = payload.phone
        if payload.is_active is not None:
            user.is_active = payload.is_active

        assigned = None
        if payload.assigned_properties is not None:
            del_stmt = delete(ManagerPropertyAssignment).where(ManagerPropertyAssignment.manager_id == staff_id)
            self.db.execute(del_stmt)
            for pid in payload.assigned_properties:
                self.db.add(ManagerPropertyAssignment(manager_id=staff_id, property_id=pid))
            assigned = payload.assigned_properties

        self.db.commit()
        self.db.refresh(user)
        return self._to_response(user, assigned)

    def delete_staff(self, staff_id: int) -> dict[str, str]:
        stmt = select(User).where(User.id == staff_id, User.deleted_at.is_(None))
        user = self.db.scalars(stmt).first()
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff member not found")

        user.deleted_at = utc_now()
        user.is_active = False
        self.db.commit()
        return {"message": "Staff member removed"}
