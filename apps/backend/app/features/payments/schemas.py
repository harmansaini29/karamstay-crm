from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class InvoiceCreate(BaseModel):
    tenancy_id: int
    billing_period: str = Field(min_length=7, max_length=7, description="YYYY-MM")
    due_date: date
    amount: Decimal = Field(ge=0, max_digits=12, decimal_places=2)


class InvoiceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenancy_id: int
    billing_period: str
    due_date: date
    amount: Decimal
    late_fee_amount: Decimal
    status: str


class UpiSubmitRequest(BaseModel):
    invoice_id: int
    utr_number: str = Field(min_length=6, max_length=24)
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)


class PaymentVerifyRequest(BaseModel):
    approve: bool
    rejection_reason: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def _require_reason_on_rejection(self) -> "PaymentVerifyRequest":
        if not self.approve and not self.rejection_reason:
            raise ValueError("rejection_reason is required when rejecting a payment")
        return self


class PaymentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    invoice_id: int | None
    tenancy_id: int | None
    amount: Decimal
    payment_type: str
    mode: str
    status: str
    razorpay_order_id: str | None
    razorpay_payment_id: str | None
    paid_at: datetime | None
    utr_number: str | None
    submitted_at: datetime | None
    verified_by_id: int | None
    verified_at: datetime | None
    rejection_reason: str | None


class LedgerEntryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenancy_id: int
    payment_id: int | None
    entry_type: str
    direction: str
    amount: Decimal
    occurred_on: date
    description: str | None


class ExpenseCreate(BaseModel):
    property_id: int
    category: str = Field(min_length=2, max_length=80)
    amount: Decimal = Field(ge=0, max_digits=12, decimal_places=2)
    expense_date: date
    description: str | None = None


class ExpenseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    property_id: int
    category: str
    amount: Decimal
    expense_date: date
    description: str | None
    receipt_document_id: int | None
