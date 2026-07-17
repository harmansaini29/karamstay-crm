from datetime import timedelta
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.security import utc_now
from app.features.analytics.repository import AnalyticsRepository
from app.features.analytics.schemas import AnalyticsDashboard
from app.features.auth.models import User
from app.features.reports.service import ReportService

UPCOMING_WINDOW_DAYS = 7


class AnalyticsService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repository = AnalyticsRepository(db)
        self.report_service = ReportService(db)

    def dashboard(self, current_user: User, property_id: int | None) -> AnalyticsDashboard:
        property_ids = self.report_service.resolve_property_scope(current_user, property_id)

        occupancy = self.report_service.occupancy(current_user, property_id)
        billing_period = utc_now().strftime("%Y-%m")
        revenue = self.report_service.revenue(current_user, billing_period, property_id)
        pending_dues = self.report_service.pending_dues(current_user, property_id)
        pending_total = sum((item.amount_due for item in pending_dues), Decimal("0.00"))

        open_tickets = self.repository.count_open_tickets(property_ids)

        today = utc_now().date()
        window_end = today + timedelta(days=UPCOMING_WINDOW_DAYS)
        move_ins = self.repository.count_upcoming_move_ins(property_ids, today, window_end)
        move_outs = self.repository.count_upcoming_move_outs(property_ids, today, window_end)

        return AnalyticsDashboard(
            property_id=property_id,
            occupancy_rate=occupancy.occupancy_rate,
            revenue_this_month=revenue.total_collected,
            pending_dues_total=pending_total,
            open_maintenance_tickets=open_tickets,
            upcoming_move_ins=move_ins,
            upcoming_move_outs=move_outs,
        )
