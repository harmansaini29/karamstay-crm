from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.features.analytics.schemas import AnalyticsDashboard
from app.features.analytics.service import AnalyticsService
from app.features.auth.dependencies import require_roles
from app.features.auth.models import User

router = APIRouter(prefix="/analytics")
DashboardUser = Annotated[User, Depends(require_roles(["owner", "manager", "accountant"]))]
DbSession = Annotated[Session, Depends(get_db)]


@router.get("/dashboard", response_model=AnalyticsDashboard)
def dashboard(
    current_user: DashboardUser,
    db: DbSession,
    property_id: int | None = None,
) -> AnalyticsDashboard:
    return AnalyticsService(db).dashboard(current_user, property_id)
