from datetime import date
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class TenantCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    phone: str = Field(min_length=8, max_length=32)
    email: str | None = Field(default=None, max_length=255)
    date_of_birth: date | None = None
    occupation: str | None = Field(default=None, max_length=120)
    emergency_contact_name: str | None = Field(default=None, max_length=120)
    emergency_contact_phone: str | None = Field(default=None, max_length=32)
    owner_notes: str | None = None


class TenantUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    email: str | None = Field(default=None, max_length=255)
    date_of_birth: date | None = None
    occupation: str | None = Field(default=None, max_length=120)
    emergency_contact_name: str | None = Field(default=None, max_length=120)
    emergency_contact_phone: str | None = Field(default=None, max_length=32)
    status: str | None = Field(default=None, min_length=2, max_length=24)
    owner_notes: str | None = None


class TenantResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int | None
    name: str
    phone: str
    email: str | None
    date_of_birth: date | None
    occupation: str | None
    emergency_contact_name: str | None
    emergency_contact_phone: str | None
    status: str


class TenancyCreate(BaseModel):
    tenant_id: int
    unit_id: int
    start_date: date
    monthly_rent: Decimal = Field(ge=0, max_digits=12, decimal_places=2)
    security_deposit: Decimal = Field(ge=0, max_digits=12, decimal_places=2)
    billing_day: int = Field(default=1, ge=1, le=28)
    bed_ids: list[int] | None = Field(default=None, min_length=1)
    installment_count: int = Field(default=1, ge=1, le=12)


class TenancyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    unit_id: int
    start_date: date
    end_date: date | None
    move_out_date: date | None
    monthly_rent: Decimal
    security_deposit: Decimal
    billing_day: int
    status: str
    bed_ids: list[int] | None


class TenancyUnitContext(BaseModel):
    """Flattened unit + property context for the tenant Home screen."""

    id: int
    unit_no: str
    building: str | None
    floor: int | None
    property_id: int
    property_name: str


class TenancyContextResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    unit_id: int
    start_date: date
    monthly_rent: Decimal
    security_deposit: Decimal
    billing_day: int
    status: str
    bed_ids: list[int] | None
    unit: TenancyUnitContext | None


class DamageCharge(BaseModel):
    inventory_item_id: int
    amount: Decimal = Field(ge=0, max_digits=12, decimal_places=2)
    note: str | None = None


class TenancyCheckoutRequest(BaseModel):
    move_out_date: date | None = None
    damage_charges: list[DamageCharge] = Field(default_factory=list)


class TenancyCheckoutResponse(BaseModel):
    tenancy: TenancyResponse
    outstanding_dues: Decimal
    damage_deduction: Decimal
    deposit_refund: Decimal
