from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.audit import AuditLogService
from app.core.security import utc_now
from app.features.auth.models import User
from app.features.payments.models import LedgerEntry
from app.features.properties.models import Bed, InventoryItem
from app.features.properties.repository import PropertyRepository
from app.features.tenants.models import Tenancy, Tenant
from app.features.tenants.repository import TenantRepository
from app.features.tenants.schemas import (
    TenancyCheckoutRequest,
    TenancyCreate,
    TenantCreate,
    TenantUpdate,
)


class TenantService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repository = TenantRepository(db)
        self.property_repository = PropertyRepository(db)
        self.audit = AuditLogService(db)

    def list_tenants(self, current_user: User) -> list[Tenant]:
        return self.repository.list_tenants(current_user.id, current_user.role.name)

    def create_tenant(self, payload: TenantCreate, current_user: User) -> Tenant:
        if self.repository.get_tenant_by_phone(payload.phone) is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A tenant with this phone number already exists",
            )
        tenant = Tenant(
            name=payload.name,
            phone=payload.phone,
            email=payload.email,
            date_of_birth=payload.date_of_birth,
            occupation=payload.occupation,
            emergency_contact_name=payload.emergency_contact_name,
            emergency_contact_phone=payload.emergency_contact_phone,
            owner_notes=payload.owner_notes,
            created_by_id=current_user.id,
            updated_by_id=current_user.id,
        )
        self.repository.add_tenant(tenant)
        self.db.flush()
        self.audit.record(
            user_id=current_user.id,
            action="tenant.create",
            entity_type="tenant",
            entity_id=tenant.id,
        )
        self.db.commit()
        self.db.refresh(tenant)
        return tenant

    def get_tenant_for_user(self, tenant_id: int, current_user: User) -> Tenant:
        tenant = self.repository.get_tenant(tenant_id)
        if tenant is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
        if current_user.role.name == "tenant":
            if tenant.user_id != current_user.id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant access denied")
        elif current_user.role.name == "manager" and not self.repository.manager_has_tenant(
            current_user.id,
            tenant_id,
        ):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant access denied")
        # owner and accountant get unrestricted read access for finance/ops visibility
        return tenant

    def get_my_profile(self, current_user: User) -> Tenant:
        tenant = self.repository.get_tenant_by_user_id(current_user.id)
        if tenant is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant profile not found")
        return tenant

    def update_tenant(self, tenant_id: int, payload: TenantUpdate, current_user: User) -> Tenant:
        tenant = self.get_tenant_for_user(tenant_id, current_user)
        update_data = payload.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(tenant, field, value)
        tenant.updated_by_id = current_user.id
        self.audit.record(
            user_id=current_user.id,
            action="tenant.update",
            entity_type="tenant",
            entity_id=tenant.id,
            metadata=update_data,
        )
        self.db.commit()
        self.db.refresh(tenant)
        return tenant

    def _resolve_and_lock_beds(self, unit_id: int, bed_ids: list[int]) -> list[Bed]:
        if len(set(bed_ids)) != len(bed_ids):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Duplicate bed_ids")
        beds: list[Bed] = []
        for bed_id in bed_ids:
            bed = self.property_repository.get_bed(bed_id)
            if bed is None or bed.unit_id != unit_id:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Bed {bed_id} not found on this unit",
                )
            if bed.status != "vacant":
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Bed {bed_id} is already occupied",
                )
            beds.append(bed)
        return beds

    def check_in(self, payload: TenancyCreate, current_user: User) -> Tenancy:
        tenant = self.repository.get_tenant(payload.tenant_id)
        if tenant is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")

        unit = self.property_repository.get_unit(payload.unit_id)
        if unit is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unit not found")
        self.property_repository.get_property(unit.property_id)
        if current_user.role.name == "manager" and not self.property_repository.manager_has_property(
            current_user.id,
            unit.property_id,
        ):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Property access denied")

        # Bed-level tenancies (shared/PG rooms) can coexist on one unit, so only the
        # whole-unit booking path (bed_ids is None) blocks on an existing active tenancy.
        beds: list[Bed] = []
        if payload.bed_ids is not None:
            beds = self._resolve_and_lock_beds(unit.id, payload.bed_ids)
        elif self.repository.get_active_tenancy_for_unit(unit.id) is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Unit already has an active tenancy",
            )

        tenancy = Tenancy(
            tenant_id=tenant.id,
            unit_id=unit.id,
            start_date=payload.start_date,
            monthly_rent=payload.monthly_rent,
            security_deposit=payload.security_deposit,
            billing_day=payload.billing_day,
            bed_ids=payload.bed_ids,
            status="active",
            created_by_id=current_user.id,
            updated_by_id=current_user.id,
        )
        self.repository.add_tenancy(tenancy)
        self.db.flush()

        for bed in beds:
            bed.status = "occupied"
            bed.updated_by_id = current_user.id

        if payload.installment_count <= 1:
            self.repository.add_ledger_entry(
                LedgerEntry(
                    tenancy_id=tenancy.id,
                    entry_type="security_deposit",
                    direction="debit",
                    amount=payload.security_deposit,
                    occurred_on=payload.start_date,
                    description="Security deposit due on check-in",
                    created_by_id=current_user.id,
                    updated_by_id=current_user.id,
                ),
            )
            self.repository.add_ledger_entry(
                LedgerEntry(
                    tenancy_id=tenancy.id,
                    entry_type="rent",
                    direction="debit",
                    amount=payload.monthly_rent,
                    occurred_on=payload.start_date,
                    description="First month rent due on check-in",
                    created_by_id=current_user.id,
                    updated_by_id=current_user.id,
                ),
            )
        else:
            # Booking-time dues only (deposit + first month) split across installments;
            # recurring monthly rent afterward is unaffected and still billed per period.
            total_due = payload.security_deposit + payload.monthly_rent
            n = payload.installment_count
            base_amount = (total_due / n).quantize(Decimal("0.01"))
            allocated = Decimal("0.00")
            for i in range(n):
                is_last = i == n - 1
                amount = (total_due - allocated) if is_last else base_amount
                allocated += amount
                self.repository.add_ledger_entry(
                    LedgerEntry(
                        tenancy_id=tenancy.id,
                        entry_type="booking_installment",
                        direction="debit",
                        amount=amount,
                        occurred_on=payload.start_date,
                        description=f"Booking due installment {i + 1}/{n}",
                        created_by_id=current_user.id,
                        updated_by_id=current_user.id,
                    ),
                )

        unit.status = "occupied"
        unit.updated_by_id = current_user.id

        self.audit.record(
            user_id=current_user.id,
            action="tenancy.check_in",
            entity_type="tenancy",
            entity_id=tenancy.id,
            metadata={"tenant_id": tenant.id, "unit_id": unit.id, "bed_ids": payload.bed_ids},
        )
        self.db.commit()
        self.db.refresh(tenancy)
        return tenancy

    def _get_tenancy_for_user(self, tenancy_id: int, current_user: User) -> Tenancy:
        tenancy = self.repository.get_tenancy(tenancy_id)
        if tenancy is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenancy not found")
        role = current_user.role.name
        if role == "tenant":
            tenant = self.repository.get_tenant_by_user_id(current_user.id)
            if tenant is None or tenancy.tenant_id != tenant.id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenancy access denied")
        elif role == "manager":
            unit = self.property_repository.get_unit(tenancy.unit_id)
            if unit is not None and not self.property_repository.manager_has_property(
                current_user.id,
                unit.property_id,
            ):
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Property access denied")
        return tenancy

    def get_tenancy_detail(self, tenancy_id: int, current_user: User) -> Tenancy:
        return self._get_tenancy_for_user(tenancy_id, current_user)

    def list_tenancies(
        self,
        current_user: User,
        *,
        tenant_id: int | None = None,
        property_id: int | None = None,
    ) -> list[Tenancy]:
        return self.repository.list_tenancies(
            current_user_id=current_user.id,
            role_name=current_user.role.name,
            tenant_id=tenant_id,
            property_id=property_id,
        )

    def get_my_tenancy_context(self, current_user: User) -> dict:
        tenant = self.repository.get_tenant_by_user_id(current_user.id)
        if tenant is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant profile not found")
        tenancy = self.repository.get_active_tenancy_for_tenant(tenant.id)
        if tenancy is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No active tenancy found")
        unit = self.property_repository.get_unit(tenancy.unit_id)
        unit_ctx = None
        if unit is not None:
            property_ = self.property_repository.get_property(unit.property_id)
            unit_ctx = {
                "id": unit.id,
                "unit_no": unit.unit_no,
                "building": unit.building,
                "floor": unit.floor,
                "property_id": unit.property_id,
                "property_name": property_.name if property_ is not None else "",
            }
        return {
            "id": tenancy.id,
            "tenant_id": tenancy.tenant_id,
            "unit_id": tenancy.unit_id,
            "start_date": tenancy.start_date,
            "monthly_rent": tenancy.monthly_rent,
            "security_deposit": tenancy.security_deposit,
            "billing_day": tenancy.billing_day,
            "status": tenancy.status,
            "bed_ids": tenancy.bed_ids,
            "unit": unit_ctx,
        }

    def checkout(
        self,
        tenancy_id: int,
        payload: TenancyCheckoutRequest,
        current_user: User,
    ) -> tuple[Tenancy, Decimal, Decimal, Decimal]:
        tenancy = self._get_tenancy_for_user(tenancy_id, current_user)
        if tenancy.status != "active":
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Tenancy is not active")

        unit = self.property_repository.get_unit(tenancy.unit_id)
        if unit is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unit not found")

        move_out_date = payload.move_out_date or utc_now().date()

        damage_deduction = Decimal("0.00")
        for charge in payload.damage_charges:
            item = self.db.get(InventoryItem, charge.inventory_item_id)
            if item is None or item.unit_id != unit.id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Inventory item {charge.inventory_item_id} does not belong to this unit",
                )
            damage_deduction += charge.amount
            self.repository.add_ledger_entry(
                LedgerEntry(
                    tenancy_id=tenancy.id,
                    entry_type="damage_deduction",
                    direction="debit",
                    amount=charge.amount,
                    occurred_on=move_out_date,
                    description=charge.note or f"Damage deduction: {item.name}",
                    created_by_id=current_user.id,
                    updated_by_id=current_user.id,
                ),
            )

        # The security deposit itself is booked as a debit at check-in (money held, not owed),
        # so it's excluded here to isolate genuinely unpaid rent/other charges.
        total_debit, total_credit = self.repository.ledger_balance(tenancy.id, move_out_date)
        outstanding_dues = Decimal(str(total_debit)) - Decimal(str(total_credit)) - tenancy.security_deposit
        outstanding_dues = max(outstanding_dues, Decimal("0.00"))

        deposit_refund = tenancy.security_deposit - damage_deduction - outstanding_dues
        deposit_refund = max(deposit_refund, Decimal("0.00"))

        if deposit_refund > 0:
            self.repository.add_ledger_entry(
                LedgerEntry(
                    tenancy_id=tenancy.id,
                    entry_type="deposit_refund",
                    direction="credit",
                    amount=deposit_refund,
                    occurred_on=move_out_date,
                    description="Security deposit refund on checkout",
                    created_by_id=current_user.id,
                    updated_by_id=current_user.id,
                ),
            )

        tenancy.status = "checked_out"
        tenancy.move_out_date = move_out_date
        tenancy.end_date = move_out_date
        tenancy.updated_by_id = current_user.id

        if tenancy.bed_ids:
            for bed_id in tenancy.bed_ids:
                bed = self.property_repository.get_bed(bed_id)
                if bed is not None:
                    bed.status = "vacant"
                    bed.updated_by_id = current_user.id

        # A unit can host several concurrent bed-level tenancies, so it only goes back
        # to vacant once no other active tenancy (whole-unit or bed-level) remains on it.
        remaining = self.repository.list_active_tenancies_for_unit(unit.id, exclude_tenancy_id=tenancy.id)
        if not remaining:
            unit.status = "vacant"
            unit.updated_by_id = current_user.id

        self.audit.record(
            user_id=current_user.id,
            action="tenancy.checkout",
            entity_type="tenancy",
            entity_id=tenancy.id,
            metadata={
                "outstanding_dues": str(outstanding_dues),
                "damage_deduction": str(damage_deduction),
                "deposit_refund": str(deposit_refund),
            },
        )
        self.db.commit()
        self.db.refresh(tenancy)
        return tenancy, outstanding_dues, damage_deduction, deposit_refund
