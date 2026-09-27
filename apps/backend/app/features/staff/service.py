import re
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
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
        clean_email = payload.email.strip().lower()
        clean_phone = re.sub(r"[\s\-\(\)]", "", payload.phone.strip())

        stmt_email = select(User).where(User.email == clean_email)
        existing_email = self.db.scalars(stmt_email).first()

        stmt_phone = select(User).where(User.phone == clean_phone)
        existing_phone = self.db.scalars(stmt_phone).first()

        if existing_email and existing_email.deleted_at is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A user with this email already exists",
            )

        if existing_phone and existing_phone.deleted_at is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A user with this phone number already exists",
            )

        if existing_email and existing_phone and existing_email.id != existing_phone.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Conflicting existing user records found for email and phone",
            )

        stmt_role = select(Role).where(Role.name == "staff")
        role = self.db.scalars(stmt_role).first()
        if not role:
            role = Role(name="staff", description="Staff Portal Access")
            self.db.add(role)
            self.db.flush()

        reusable_user = existing_email or existing_phone
        if reusable_user and reusable_user.deleted_at is not None:
            # Reactivate soft-deleted user
            user = reusable_user
            user.name = payload.name.strip()
            user.email = clean_email
            user.phone = clean_phone
            user.password_hash = hash_password(payload.password)
            user.role_id = role.id
            user.is_active = True
            user.deleted_at = None
        else:
            user = User(
                name=payload.name.strip(),
                email=clean_email,
                phone=clean_phone,
                password_hash=hash_password(payload.password),
                role_id=role.id,
                is_active=True,
            )
            self.db.add(user)
            self.db.flush()

        assigned: list[int] = []
        if payload.assigned_properties:
            del_stmt = delete(ManagerPropertyAssignment).where(ManagerPropertyAssignment.manager_id == user.id)
            self.db.execute(del_stmt)
            for pid in payload.assigned_properties:
                assignment = ManagerPropertyAssignment(manager_id=user.id, property_id=pid)
                self.db.add(assignment)
                assigned.append(pid)

        try:
            self.db.commit()
        except IntegrityError as exc:
            self.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Could not create staff account due to duplicate or conflicting user data",
            ) from exc

        self.db.refresh(user)
        return self._to_response(user, assigned)

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
