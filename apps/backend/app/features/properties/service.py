from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.audit import AuditLogService
from app.core.security import utc_now
from app.features.auth.models import User
from app.features.properties.models import Bed, Property, Unit
from app.features.properties.repository import PropertyRepository
from app.features.properties.schemas import PropertyCreate, PropertyUpdate, UnitCreate, UnitUpdate


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
            capacity=payload.capacity,
            notes=payload.notes,
            latitude=payload.latitude,
            longitude=payload.longitude,
            created_by_id=current_user.id,
            updated_by_id=current_user.id,
        )
        self.repository.add_unit(unit)
        self.db.flush()
        self.audit.record(
            user_id=current_user.id,
            action="unit.create",
            entity_type="unit",
            entity_id=unit.id,
        )
        self.db.commit()
        self.db.refresh(unit)
        return unit

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
