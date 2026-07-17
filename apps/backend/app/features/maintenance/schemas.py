from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class MaintenanceTicketCreate(BaseModel):
    unit_id: int
    category: str = Field(min_length=2, max_length=60)
    priority: str = Field(default="medium", pattern="^(low|medium|high|urgent)$")
    description: str = Field(min_length=5)


class MaintenanceTicketUpdate(BaseModel):
    status: str | None = Field(default=None, pattern="^(open|in_progress|completed|closed)$")
    priority: str | None = Field(default=None, pattern="^(low|medium|high|urgent)$")
    assigned_to_id: int | None = None
    cost: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)


class MaintenanceTicketResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int | None
    unit_id: int
    category: str
    priority: str
    status: str
    description: str
    assigned_to_id: int | None
    cost: Decimal
    resolved_at: datetime | None
    created_at: datetime
