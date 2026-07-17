from sqlalchemy import select
from sqlalchemy.orm import Session

from app.features.properties.models import Bed, ManagerPropertyAssignment, Property, Unit


class PropertyRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list_properties(self, user_id: int, role_name: str) -> list[Property]:
        statement = select(Property).where(Property.deleted_at.is_(None))
        if role_name == "manager":
            statement = statement.join(ManagerPropertyAssignment).where(
                ManagerPropertyAssignment.manager_id == user_id,
            )
        return list(self.db.scalars(statement.order_by(Property.name)))

    def get_property(self, property_id: int) -> Property | None:
        statement = select(Property).where(
            Property.id == property_id,
            Property.deleted_at.is_(None),
        )
        return self.db.scalar(statement)

    def manager_has_property(self, manager_id: int, property_id: int) -> bool:
        statement = select(ManagerPropertyAssignment.id).where(
            ManagerPropertyAssignment.manager_id == manager_id,
            ManagerPropertyAssignment.property_id == property_id,
        )
        return self.db.scalar(statement) is not None

    def add_property(self, property: Property) -> Property:
        self.db.add(property)
        return property

    def list_units(self, property_id: int) -> list[Unit]:
        statement = select(Unit).where(
            Unit.property_id == property_id,
            Unit.deleted_at.is_(None),
        )
        return list(self.db.scalars(statement.order_by(Unit.building, Unit.floor, Unit.unit_no)))

    def get_unit(self, unit_id: int) -> Unit | None:
        statement = select(Unit).where(Unit.id == unit_id, Unit.deleted_at.is_(None))
        return self.db.scalar(statement)

    def add_unit(self, unit: Unit) -> Unit:
        self.db.add(unit)
        return unit

    def list_beds(self, unit_id: int) -> list[Bed]:
        statement = select(Bed).where(Bed.unit_id == unit_id, Bed.deleted_at.is_(None))
        return list(self.db.scalars(statement.order_by(Bed.bed_no)))

    def get_bed(self, bed_id: int) -> Bed | None:
        statement = select(Bed).where(Bed.id == bed_id, Bed.deleted_at.is_(None))
        return self.db.scalar(statement)

    def add_bed(self, bed: Bed) -> Bed:
        self.db.add(bed)
        return bed
