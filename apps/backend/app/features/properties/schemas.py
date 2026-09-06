from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class PropertyCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    address: str = Field(min_length=5)
    property_type: str = Field(min_length=2, max_length=40)
    city: str | None = Field(default=None, max_length=80)
    state: str | None = Field(default=None, max_length=80)
    pincode: str | None = Field(default=None, max_length=16)


class PropertyUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    address: str | None = Field(default=None, min_length=5)
    property_type: str | None = Field(default=None, min_length=2, max_length=40)
    city: str | None = Field(default=None, max_length=80)
    state: str | None = Field(default=None, max_length=80)
    pincode: str | None = Field(default=None, max_length=16)
    is_active: bool | None = None


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
    is_active: bool


class UnitCreate(BaseModel):
    building: str | None = Field(default=None, max_length=80)
    floor: int | None = None
    unit_no: str = Field(min_length=1, max_length=40)
    unit_type: str = Field(min_length=2, max_length=20)
    rent: Decimal = Field(ge=0, max_digits=12, decimal_places=2)
    deposit: Decimal = Field(ge=0, max_digits=12, decimal_places=2)
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
