from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class BankAccountResponse(BaseModel):
    key: str
    name: str
    bank_name: str
    van_prefix: str
    ifsc: str
    upi_handle_template: str
    webhook_url: str = "/api/v1/payments/webhook/smart-collect"
    is_active: bool
    status: str
    description: str = ""
    is_default: bool = False


class PropertyCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    address: str = Field(min_length=5)
    property_type: str = Field(min_length=2, max_length=40)
    city: str | None = Field(default=None, max_length=80)
    state: str | None = Field(default=None, max_length=80)
    pincode: str | None = Field(default=None, max_length=16)
    payment_upi_id: str | None = Field(default=None, max_length=120)
    bank_account_key: str | None = Field(default="hdfc_1", max_length=32)

    @field_validator("bank_account_key")
    @classmethod
    def validate_bank_account_key(cls, v: str | None) -> str | None:
        if v is None:
            return "hdfc_1"
        from app.core.bank_accounts import get_bank_account

        account = get_bank_account(v)
        if not account:
            raise ValueError(
                f"Bank account '{v}' is not recognized. "
                "Must be one of the registered bank accounts (e.g. 'hdfc_1', 'hdfc_2', 'nkgsb_1')."
            )
        return account.key


class PropertyUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    address: str | None = Field(default=None, min_length=5)
    property_type: str | None = Field(default=None, min_length=2, max_length=40)
    city: str | None = Field(default=None, max_length=80)
    state: str | None = Field(default=None, max_length=80)
    pincode: str | None = Field(default=None, max_length=16)
    payment_upi_id: str | None = Field(default=None, max_length=120)
    bank_account_key: str | None = Field(default=None, max_length=32)
    is_active: bool | None = None

    @field_validator("bank_account_key")
    @classmethod
    def validate_bank_account_key(cls, v: str | None) -> str | None:
        if v is None:
            return v
        from app.core.bank_accounts import get_bank_account

        account = get_bank_account(v)
        if not account:
            raise ValueError(
                f"Bank account '{v}' is not recognized. "
                "Must be one of the registered bank accounts (e.g. 'hdfc_1', 'hdfc_2', 'nkgsb_1')."
            )
        return account.key


class PropertyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    owner_id: int
    name: str
    address: str
    property_type: str
    city: str | None
    state: str | None
    pincode: str | None
    payment_upi_id: str | None = None
    bank_account_key: str | None = "hdfc_1"
    bank_provider: str | None = None
    is_active: bool

    @model_validator(mode="after")
    def resolve_bank_account_fields(self) -> "PropertyResponse":
        if not self.bank_account_key:
            self.bank_account_key = self.bank_provider or "hdfc_1"
        return self


class UnitCreate(BaseModel):
    building: str | None = Field(default=None, max_length=80)
    floor: int | None = None
    unit_no: str = Field(min_length=1, max_length=40)
    unit_type: str = Field(min_length=2, max_length=20)
    rent: Decimal = Field(default=Decimal("0.00"), ge=0, max_digits=12, decimal_places=2)
    deposit: Decimal = Field(default=Decimal("0.00"), ge=0, max_digits=12, decimal_places=2)
    notes: str | None = None
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)

    # ── Tiered bed-block capacities ───────────────────────────────────────────
    # Each field defaults to 0. Consumers that sent the legacy `capacity` int
    # are handled: the validator derives capacity = MB + CB + H automatically,
    # keeping every downstream query, card, and CHECK constraint intact.
    master_bed_capacity: int = Field(default=0, ge=0)
    common_bed_capacity: int = Field(default=0, ge=0)
    hall_capacity: int = Field(default=0, ge=0)

    # Backward-compat derived field — populated by the validator.
    # Service code reads `payload.capacity`; no service edits required.
    capacity: int = Field(default=0, ge=0)

    @model_validator(mode="after")
    def derive_capacity_and_validate_total(self) -> "UnitCreate":
        total = self.master_bed_capacity + self.common_bed_capacity + self.hall_capacity
        if total <= 0:
            raise ValueError(
                "Total bed capacity must be > 0. "
                "Provide at least one of master_bed_capacity, common_bed_capacity, or hall_capacity."
            )
        self.capacity = total
        return self


class UnitUpdate(BaseModel):
    building: str | None = Field(default=None, max_length=80)
    floor: int | None = None
    unit_no: str | None = Field(default=None, min_length=1, max_length=40)
    unit_type: str | None = Field(default=None, min_length=2, max_length=20)
    rent: Decimal | None = Field(default=None, ge=0)
    deposit: Decimal | None = Field(default=None, ge=0)
    status: str | None = Field(default=None, min_length=2, max_length=24)
    capacity: int | None = Field(default=None, gt=0)
    notes: str | None = None
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)


class BedResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    unit_id: int
    bed_no: str
    status: str
    room_type: str | None


class UnitResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    property_id: int
    building: str | None
    floor: int | None
    unit_no: str
    unit_type: str
    rent: Decimal
    deposit: Decimal
    status: str
    capacity: int
    notes: str | None
    latitude: float | None
    longitude: float | None
    beds: list[BedResponse] = []


# ── Bed Assignment / Allocation Schemas ───────────────────────────────────────

class BedAssign(BaseModel):
    """Payload for single or multi-bed tenant assignment."""
    bed_ids: list[int] = Field(min_length=1, description="One or more bed IDs to assign atomically")
    tenant_id: int = Field(gt=0)


class BedVacate(BaseModel):
    """Payload to vacate one or more beds (checkout / unassign)."""
    bed_ids: list[int] = Field(min_length=1)


class BedWithTenantResponse(BaseModel):
    """Bed row extended with occupant summary (for grouped UI rendering)."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    unit_id: int
    bed_no: str
    status: str
    room_type: str | None
    tenant_id: int | None = None
    tenant_name: str | None = None
