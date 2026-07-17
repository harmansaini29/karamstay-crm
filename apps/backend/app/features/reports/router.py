from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.features.auth.dependencies import require_roles
from app.features.auth.models import User
from app.features.reports.export import build_export_response
from app.features.reports.schemas import (
    CollectionRateReport,
    DefaulterItem,
    ExpenseCategoryTotal,
    MaintenanceCostReport,
    OccupancyReport,
    PendingDueItem,
    RevenueReport,
)
from app.features.reports.service import ReportService

router = APIRouter(prefix="/reports")
OpsUser = Annotated[User, Depends(require_roles(["owner", "manager"]))]
FinanceUser = Annotated[User, Depends(require_roles(["owner", "accountant"]))]
DbSession = Annotated[Session, Depends(get_db)]


@router.get("/occupancy", response_model=None)
def occupancy_report(
    current_user: OpsUser,
    db: DbSession,
    property_id: int | None = None,
    export_format: str = "json",
) -> OccupancyReport | Response:
    data = ReportService(db).occupancy(current_user, property_id)
    export = build_export_response(export_format=export_format, title="occupancy_report", rows=[data.model_dump()])
    return export or data


@router.get("/revenue", response_model=None)
def revenue_report(
    current_user: FinanceUser,
    db: DbSession,
    billing_period: str | None = None,
    property_id: int | None = None,
    export_format: str = "json",
) -> RevenueReport | Response:
    data = ReportService(db).revenue(current_user, billing_period, property_id)
    export = build_export_response(export_format=export_format, title="revenue_report", rows=[data.model_dump()])
    return export or data


@router.get("/collection-rate", response_model=None)
def collection_rate_report(
    current_user: FinanceUser,
    db: DbSession,
    billing_period: str | None = None,
    property_id: int | None = None,
    export_format: str = "json",
) -> CollectionRateReport | Response:
    data = ReportService(db).collection_rate(current_user, billing_period, property_id)
    export = build_export_response(
        export_format=export_format,
        title="collection_rate_report",
        rows=[data.model_dump()],
    )
    return export or data


@router.get("/pending-dues", response_model=None)
def pending_dues_report(
    current_user: FinanceUser,
    db: DbSession,
    property_id: int | None = None,
    export_format: str = "json",
) -> list[PendingDueItem] | Response:
    data = ReportService(db).pending_dues(current_user, property_id)
    export = build_export_response(
        export_format=export_format,
        title="pending_dues_report",
        rows=[item.model_dump() for item in data],
    )
    return export or data


@router.get("/expenses", response_model=None)
def expenses_report(
    current_user: FinanceUser,
    db: DbSession,
    property_id: int | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    export_format: str = "json",
) -> list[ExpenseCategoryTotal] | Response:
    data = ReportService(db).expenses(current_user, property_id, start_date, end_date)
    export = build_export_response(
        export_format=export_format,
        title="expenses_report",
        rows=[item.model_dump() for item in data],
    )
    return export or data


@router.get("/defaulters", response_model=None)
def defaulters_report(
    current_user: FinanceUser,
    db: DbSession,
    property_id: int | None = None,
    export_format: str = "json",
) -> list[DefaulterItem] | Response:
    data = ReportService(db).defaulters(current_user, property_id)
    export = build_export_response(
        export_format=export_format,
        title="defaulters_report",
        rows=[item.model_dump() for item in data],
    )
    return export or data


@router.get("/maintenance-cost", response_model=None)
def maintenance_cost_report(
    current_user: OpsUser,
    db: DbSession,
    property_id: int | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    export_format: str = "json",
) -> MaintenanceCostReport | Response:
    data = ReportService(db).maintenance_cost(current_user, property_id, start_date, end_date)
    export = build_export_response(
        export_format=export_format,
        title="maintenance_cost_report",
        rows=[data.model_dump()],
    )
    return export or data
