from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class StaffRole(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class StaffResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str | None = None
    phone: str | None = None
    role: StaffRole
    is_active: bool
    assigned_properties: list[int] = []
    created_at: datetime


class StaffCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    phone: str = Field(min_length=10, max_length=32)
    password: str = Field(min_length=8, max_length=128)
    assigned_properties: list[int] = []


class StaffUpdate(BaseModel):
    name: str | None = None
    phone: str | None = None
    is_active: bool | None = None
    assigned_properties: list[int] | None = None
