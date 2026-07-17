from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ConsentCreate(BaseModel):
    consent_type: str = Field(min_length=2, max_length=60)
    granted: bool
    policy_version: str = Field(min_length=1, max_length=20)


class ConsentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    consent_type: str
    granted: bool
    policy_version: str
    created_at: datetime


class DataRequestCreate(BaseModel):
    request_type: Literal["export", "deletion"]


class DataRequestResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    request_type: str
    status: str
    created_at: datetime
    resolved_at: datetime | None
