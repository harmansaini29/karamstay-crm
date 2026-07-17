from decimal import Decimal

from pydantic import BaseModel


class AnalyticsDashboard(BaseModel):
    property_id: int | None
    occupancy_rate: float
    revenue_this_month: Decimal
    pending_dues_total: Decimal
    open_maintenance_tickets: int
    upcoming_move_ins: int
    upcoming_move_outs: int
