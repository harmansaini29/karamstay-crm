from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


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
    capacity: int = Field(default=1, gt=0)
    notes: str | None = None
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)


class UnitUpdate(BaseModel):
    building: str | None = Field(default=None, max_length=80)
    floor: int | None = None
    unit_no: str | None = Field(default=None, min_length=1, max_length=40)
    unit_type: str | None = Field(default=None, min_length=2, max_length=20)
    rent: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    deposit: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    status: str | None = Field(default=None, min_length=2, max_length=24)
    capacity: int | None = Field(default=None, gt=0)
    notes: str | None = None
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)


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


class BedResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    unit_id: int
    bed_no: str
    status: str
