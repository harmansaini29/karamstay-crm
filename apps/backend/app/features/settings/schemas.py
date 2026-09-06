from decimal import Decimal

from pydantic import BaseModel, Field


class SettingsResponse(BaseModel):
    late_fee_grace_days: int
    late_fee_percent_per_day: Decimal
    agreement_reminder_days: list[int]
    brand_name: str
    whatsapp_otp_template: str
    whatsapp_payment_confirmation_template: str
    whatsapp_generic_notice_template: str
    owner_upi_vpa: str
    payee_name: str
    grievance_officer_name: str
    grievance_officer_email: str
    grievance_officer_phone: str


class SettingsUpdate(BaseModel):
    late_fee_grace_days: int | None = Field(default=None, ge=0, le=30)
    late_fee_percent_per_day: Decimal | None = Field(default=None, ge=0, le=10)
    agreement_reminder_days: list[int] | None = None
    brand_name: str | None = Field(default=None, min_length=1, max_length=120)
    whatsapp_otp_template: str | None = Field(default=None, min_length=1, max_length=120)
    whatsapp_payment_confirmation_template: str | None = Field(default=None, min_length=1, max_length=120)
    whatsapp_generic_notice_template: str | None = Field(default=None, min_length=1, max_length=120)
    owner_upi_vpa: str | None = Field(default=None, max_length=120)
    payee_name: str | None = Field(default=None, min_length=1, max_length=120)
    grievance_officer_name: str | None = Field(default=None, max_length=120)
    grievance_officer_email: str | None = Field(default=None, max_length=255)
    grievance_officer_phone: str | None = Field(default=None, max_length=32)
