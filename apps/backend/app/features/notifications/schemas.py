from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class DeviceRegisterRequest(BaseModel):
    fcm_token: str = Field(min_length=8, max_length=255)
    platform: str = Field(default="android", pattern="^(android|ios|web)$")


class NotificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    channel: str
    notification_type: str
    title: str
    message: str
    status: str
    sent_at: datetime | None
    read_at: datetime | None
    created_at: datetime


class BroadcastNoticeRequest(BaseModel):
    title: str = Field(min_length=2, max_length=160)
    message: str = Field(min_length=2, max_length=1000)
    property_id: int | None = None


class BroadcastNoticeResponse(BaseModel):
    recipients_notified: int
