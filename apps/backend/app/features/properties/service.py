from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.audit import AuditLogService
from app.core.security import utc_now
from app.features.auth.models import User
from app.features.properties.models import Bed, Property, Unit
from app.features.properties.repository import PropertyRepository
from app.features.properties.schemas import (
    BedAssign,
    BedVacate,
    PropertyCreate,
    PropertyUpdate,
    UnitCreate,
    UnitUpdate,
)


class PropertyService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repository = PropertyRepository(db)
        self.audit = AuditLogService(db)

    def list_properties(self, current_user: User) -> list[Property]:
        return self.repository.list_properties(current_user.id, current_user.role.name)

    def create_property(self, payload: PropertyCreate, current_user: User) -> Property:
        property = Property(
            owner_id=current_user.id,
            name=payload.name,
            address=payload.address,
            property_type=payload.property_type,
            city=payload.city,
            state=payload.state,
            pincode=payload.pincode,
            created_by_id=current_user.id,
            updated_by_id=current_user.id,
        )
        self.repository.add_property(property)
        self.db.flush()
        self.audit.record(
            user_id=current_user.id,
            action="property.create",
            entity_type="property",
            entity_id=property.id,
        )
        self.db.commit()
        self.db.refresh(property)
        return property

    def get_property_for_user(self, property_id: int, current_user: User) -> Property:
        property = self.repository.get_property(property_id)
        if property is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Property not found")
        if current_user.role.name == "manager" and not self.repository.manager_has_property(
            current_user.id,
            property_id,
        ):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Property access denied")
        return property

    def update_property(
        self,
        property_id: int,
        payload: PropertyUpdate,
        current_user: User,
    ) -> Property:
        property = self.get_property_for_user(property_id, current_user)
        update_data = payload.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(property, field, value)
        property.updated_by_id = current_user.id
        self.audit.record(
            user_id=current_user.id,
            action="property.update",
            entity_type="property",
            entity_id=property.id,
            metadata=update_data,
        )
        self.db.commit()
        self.db.refresh(property)
        return property

    def delete_property(self, property_id: int, current_user: User) -> None:
        property = self.get_property_for_user(property_id, current_user)
        property.deleted_at = utc_now()
        property.updated_by_id = current_user.id
        self.audit.record(
            user_id=current_user.id,
            action="property.delete",
            entity_type="property",
            entity_id=property.id,
        )
        self.db.commit()

    def list_units(self, property_id: int, current_user: User) -> list[Unit]:
        self.get_property_for_user(property_id, current_user)
        return self.repository.list_units(property_id)

    def create_unit(self, property_id: int, payload: UnitCreate, current_user: User) -> Unit:
        self.get_property_for_user(property_id, current_user)
        unit = Unit(
            property_id=property_id,
            building=payload.building,
            floor=payload.floor,
            unit_no=payload.unit_no,
            unit_type=payload.unit_type,
            rent=payload.rent,
            deposit=payload.deposit,
            capacity=payload.capacity,  # derived = MB + CB + H by schema validator
            notes=payload.notes,
            latitude=payload.latitude,
            longitude=payload.longitude,
            created_by_id=current_user.id,
            updated_by_id=current_user.id,
        )
        self.repository.add_unit(unit)
        self.db.flush()  # unit.id is now available

        # ── Deterministic bed generation ─────────────────────────────────────
        # Each block is processed independently; capacity=0 → block skipped.
        bed_blocks = [
            (payload.master_bed_capacity, "MB", "MASTER_BED"),
            (payload.common_bed_capacity, "CB", "COMMON_BED"),
            (payload.hall_capacity,       "H",  "HALL"),
        ]
        beds_to_add: list[Bed] = []
        for block_capacity, code, room_type in bed_blocks:
            for i in range(1, block_capacity + 1):
                beds_to_add.append(
                    Bed(
                        unit_id=unit.id,
                        bed_no=f"Bed {code} {i}",
                        status="vacant",
                        room_type=room_type,
                        created_by_id=current_user.id,
                        updated_by_id=current_user.id,
                    )
                )
        self.db.add_all(beds_to_add)
        # ─────────────────────────────────────────────────────────────────────

        self.audit.record(
            user_id=current_user.id,
            action="unit.create",
            entity_type="unit",
            entity_id=unit.id,
        )
        self.db.commit()
        return self.get_unit_for_user(unit.id, current_user)


    def get_unit_for_user(self, unit_id: int, current_user: User) -> Unit:
        unit = self.repository.get_unit(unit_id)
        if unit is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unit not found")
        self.get_property_for_user(unit.property_id, current_user)
        return unit

    def update_unit(self, unit_id: int, payload: UnitUpdate, current_user: User) -> Unit:
        unit = self.get_unit_for_user(unit_id, current_user)
        update_data = payload.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(unit, field, value)
        unit.updated_by_id = current_user.id
        self.audit.record(
            user_id=current_user.id,
            action="unit.update",
            entity_type="unit",
            entity_id=unit.id,
            metadata=update_data,
        )
        self.db.commit()
        self.db.refresh(unit)
        return unit

    def delete_unit(self, unit_id: int, current_user: User) -> None:
        unit = self.get_unit_for_user(unit_id, current_user)
        unit.deleted_at = utc_now()
        unit.updated_by_id = current_user.id
        self.audit.record(
            user_id=current_user.id,
            action="unit.delete",
            entity_type="unit",
            entity_id=unit.id,
        )
        self.db.commit()

    def list_beds(self, unit_id: int, current_user: User) -> list[Bed]:
        self.get_unit_for_user(unit_id, current_user)
        return self.repository.list_beds(unit_id)

    def assign_beds(
        self,
        unit_id: int,
        payload: BedAssign,
        current_user: User,
    ) -> list[Bed]:
        """Atomically assign one or more beds to a tenant.

        Raises:
            HTTP 404 – any bed_id not found in this unit.
            HTTP 409 – any bed is already OCCUPIED (double-booking guard).
        Uses SELECT … WITH FOR UPDATE (row-level lock) to prevent race conditions
        when two concurrent requests try to book the same bed.
        """
        from sqlalchemy import select

        from app.features.properties.models import Bed  # avoid circular at module level

        self.get_unit_for_user(unit_id, current_user)

        beds: list[Bed] = []
        try:
            for bed_id in payload.bed_ids:
                # Row-level lock: blocks concurrent transactions from reading stale status
                stmt = (
                    select(Bed)
                    .where(Bed.id == bed_id, Bed.unit_id == unit_id, Bed.deleted_at.is_(None))
                    .with_for_update()
                )
                bed = self.db.scalar(stmt)
                if bed is None:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail=f"Bed {bed_id} not found in unit {unit_id}",
                    )
                if bed.status == "occupied":
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail=f"Bed {bed.bed_no} is already occupied — cannot double-book",
                    )
                bed.status = "occupied"
                bed.updated_by_id = current_user.id
                beds.append(bed)

            # Update parent unit status if all beds were previously vacant
            unit = self.repository.get_unit(unit_id)
            if unit:
                all_unit_beds = self.repository.list_beds(unit_id)
                occupied_count = sum(1 for b in all_unit_beds if b.status == "occupied")
                unit.status = "occupied" if occupied_count > 0 else "vacant"
                unit.updated_by_id = current_user.id

            self.audit.record(
                user_id=current_user.id,
                action="beds.assign",
                entity_type="unit",
                entity_id=unit_id,
                metadata={"bed_ids": payload.bed_ids, "tenant_id": payload.tenant_id},
            )
            self.db.commit()
            for b in beds:
                self.db.refresh(b)
        except HTTPException:
            self.db.rollback()
            raise
        except Exception as exc:
            self.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Bed assignment failed: {exc}",
            ) from exc
        return beds

    def vacate_beds(
        self,
        unit_id: int,
        payload: BedVacate,
        current_user: User,
    ) -> list[Bed]:
        """Atomically vacate (unassign) one or more beds.

        Resets each bed to VACANT. If all beds in the unit are now vacant,
        sets the parent unit status back to 'vacant'.
        """
        from sqlalchemy import select

        from app.features.properties.models import Bed

        self.get_unit_for_user(unit_id, current_user)

        beds: list[Bed] = []
        try:
            for bed_id in payload.bed_ids:
                stmt = (
                    select(Bed)
                    .where(Bed.id == bed_id, Bed.unit_id == unit_id, Bed.deleted_at.is_(None))
                    .with_for_update()
                )
                bed = self.db.scalar(stmt)
                if bed is None:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail=f"Bed {bed_id} not found in unit {unit_id}",
                    )
                bed.status = "vacant"
                bed.updated_by_id = current_user.id
                beds.append(bed)

            # Sync parent unit status
            unit = self.repository.get_unit(unit_id)
            if unit:
                all_unit_beds = self.repository.list_beds(unit_id)
                occupied_count = sum(1 for b in all_unit_beds if b.status == "occupied")
                unit.status = "occupied" if occupied_count > 0 else "vacant"
                unit.updated_by_id = current_user.id

            self.audit.record(
                user_id=current_user.id,
                action="beds.vacate",
                entity_type="unit",
                entity_id=unit_id,
                metadata={"bed_ids": payload.bed_ids},
            )
            self.db.commit()
            for b in beds:
                self.db.refresh(b)
        except HTTPException:
            self.db.rollback()
            raise
        except Exception as exc:
            self.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Bed vacate failed: {exc}",
            ) from exc
        return beds
