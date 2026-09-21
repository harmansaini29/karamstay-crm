from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.features.payments.models import LedgerEntry
from app.features.properties.models import ManagerPropertyAssignment as MPA
from app.features.properties.models import Property, Unit
from app.features.tenants.models import Tenancy, Tenant


class TenantRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list_tenants(self, current_user_id: int, role_name: str) -> list[Tenant]:
        statement = select(Tenant).where(Tenant.deleted_at.is_(None))
        if role_name == "manager":
            statement = (
                statement.join(Tenancy, Tenancy.tenant_id == Tenant.id)
                .join(Unit, Unit.id == Tenancy.unit_id)
                .join(Property, Property.id == Unit.property_id)
                .join(MPA, MPA.property_id == Property.id)
                .where(MPA.manager_id == current_user_id)
                .distinct()
            )
        return list(self.db.scalars(statement.order_by(Tenant.name)))

    def get_tenant(self, tenant_id: int) -> Tenant | None:
        statement = select(Tenant).where(Tenant.id == tenant_id, Tenant.deleted_at.is_(None))
        return self.db.scalar(statement)

    def get_tenant_by_phone(self, phone: str) -> Tenant | None:
        raw_phone = phone.strip()
        exact = self.db.scalar(select(Tenant).where(Tenant.phone == raw_phone, Tenant.deleted_at.is_(None)))
        if exact is not None:
            return exact

        digits = "".join(c for c in raw_phone if c.isdigit())
        if len(digits) >= 10:
            last10 = digits[-10:]
            candidates = [last10, f"+91{last10}", f"91{last10}", f"0{last10}"]
            stmt = select(Tenant).where(Tenant.phone.in_(candidates), Tenant.deleted_at.is_(None))
            found = self.db.scalar(stmt)
            if found is not None:
                return found
            stmt_like = select(Tenant).where(Tenant.phone.like(f"%{last10}"), Tenant.deleted_at.is_(None))
            return self.db.scalar(stmt_like)
        return None

    def get_tenant_by_user_id(self, user_id: int) -> Tenant | None:
        statement = select(Tenant).where(Tenant.user_id == user_id, Tenant.deleted_at.is_(None))
        return self.db.scalar(statement)

    def add_tenant(self, tenant: Tenant) -> Tenant:
        self.db.add(tenant)
        return tenant

    def manager_has_tenant(self, manager_id: int, tenant_id: int) -> bool:
        statement = (
            select(Tenancy.id)
            .join(Unit, Unit.id == Tenancy.unit_id)
            .join(Property, Property.id == Unit.property_id)
            .join(MPA, MPA.property_id == Property.id)
            .where(MPA.manager_id == manager_id, Tenancy.tenant_id == tenant_id)
        )
        return self.db.scalar(statement) is not None

    def get_active_tenancy_for_unit(self, unit_id: int) -> Tenancy | None:
        statement = select(Tenancy).where(
            Tenancy.unit_id == unit_id,
            Tenancy.status == "active",
            Tenancy.deleted_at.is_(None),
        )
        return self.db.scalar(statement)

    def list_active_tenancies_for_unit(self, unit_id: int, *, exclude_tenancy_id: int | None = None) -> list[Tenancy]:
        statement = select(Tenancy).where(
            Tenancy.unit_id == unit_id,
            Tenancy.status == "active",
            Tenancy.deleted_at.is_(None),
        )
        if exclude_tenancy_id is not None:
            statement = statement.where(Tenancy.id != exclude_tenancy_id)
        return list(self.db.scalars(statement))

    def get_tenancy(self, tenancy_id: int) -> Tenancy | None:
        statement = select(Tenancy).where(Tenancy.id == tenancy_id, Tenancy.deleted_at.is_(None))
        return self.db.scalar(statement)

    def get_active_tenancy_for_tenant(self, tenant_id: int) -> Tenancy | None:
        statement = (
            select(Tenancy)
            .where(
                Tenancy.tenant_id == tenant_id,
                Tenancy.status == "active",
                Tenancy.deleted_at.is_(None),
            )
            .order_by(Tenancy.start_date.desc())
        )
        return self.db.scalar(statement)

    def list_tenancies(
        self,
        *,
        current_user_id: int,
        role_name: str,
        tenant_id: int | None = None,
        property_id: int | None = None,
    ) -> list[Tenancy]:
        statement = select(Tenancy).join(Unit, Unit.id == Tenancy.unit_id).where(Tenancy.deleted_at.is_(None))
        if role_name == "manager":
            statement = statement.join(Property, Property.id == Unit.property_id).join(
                MPA,
                MPA.property_id == Property.id,
            ).where(MPA.manager_id == current_user_id)
        if tenant_id is not None:
            statement = statement.where(Tenancy.tenant_id == tenant_id)
        if property_id is not None:
            statement = statement.where(Unit.property_id == property_id)
        return list(self.db.scalars(statement.order_by(Tenancy.start_date.desc())))

    def add_tenancy(self, tenancy: Tenancy) -> Tenancy:
        self.db.add(tenancy)
        return tenancy

    def add_ledger_entry(self, entry: LedgerEntry) -> LedgerEntry:
        self.db.add(entry)
        return entry

    def ledger_balance(self, tenancy_id: int, as_of: date) -> tuple[float, float]:
        debit_statement = select(func.coalesce(func.sum(LedgerEntry.amount), 0)).where(
            LedgerEntry.tenancy_id == tenancy_id,
            LedgerEntry.direction == "debit",
            LedgerEntry.occurred_on <= as_of,
            LedgerEntry.deleted_at.is_(None),
        )
        credit_statement = select(func.coalesce(func.sum(LedgerEntry.amount), 0)).where(
            LedgerEntry.tenancy_id == tenancy_id,
            LedgerEntry.direction == "credit",
            LedgerEntry.occurred_on <= as_of,
            LedgerEntry.deleted_at.is_(None),
        )
        total_debit = self.db.scalar(debit_statement) or 0
        total_credit = self.db.scalar(credit_statement) or 0
        return float(total_debit), float(total_credit)
