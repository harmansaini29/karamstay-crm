from datetime import date
from decimal import Decimal

from pydantic import BaseModel


class OccupancyReport(BaseModel):
    property_id: int | None
    total_units: int
    occupied_units: int
    vacant_units: int
    occupancy_rate: float


class RevenueReport(BaseModel):
    billing_period: str | None
    total_invoiced: Decimal
    total_collected: Decimal


class CollectionRateReport(BaseModel):
    billing_period: str | None
    total_invoiced: Decimal
    total_collected: Decimal
    collection_rate: float


class PendingDueItem(BaseModel):
    invoice_id: int
    tenancy_id: int
    tenant_name: str
    unit_label: str
    amount_due: Decimal
    due_date: date
    days_overdue: int


class ExpenseCategoryTotal(BaseModel):
    category: str
    total_amount: Decimal


class DefaulterItem(BaseModel):
    tenant_id: int
    tenant_name: str
    phone: str
    total_overdue: Decimal
    oldest_due_date: date


class MaintenanceCostReport(BaseModel):
    property_id: int | None
    total_cost: Decimal
    ticket_count: int
