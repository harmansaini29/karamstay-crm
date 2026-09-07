from fastapi import APIRouter

from app.features.analytics.router import router as analytics_router
from app.features.auth.router import router as auth_router
from app.features.consents.router import router as consents_router
from app.features.documents.router import router as documents_router
from app.features.maintenance.router import router as maintenance_router
from app.features.notifications.router import router as notifications_router
from app.features.payments.router import router as payments_router
from app.features.properties.router import router as properties_router
from app.features.reports.router import router as reports_router
from app.features.settings.router import router as settings_router
from app.features.staff.router import router as staff_router
from app.features.tenants.router import router as tenants_router

api_router = APIRouter()
api_router.include_router(auth_router, prefix="/auth", tags=["auth"])
api_router.include_router(analytics_router, tags=["analytics"])
api_router.include_router(properties_router, tags=["properties"])
api_router.include_router(tenants_router, tags=["tenants"])
api_router.include_router(payments_router, tags=["payments"])
api_router.include_router(documents_router, tags=["documents"])
api_router.include_router(notifications_router, tags=["notifications"])
api_router.include_router(maintenance_router, tags=["maintenance"])
api_router.include_router(reports_router, tags=["reports"])
api_router.include_router(settings_router, tags=["settings"])
api_router.include_router(consents_router, tags=["consents"])
api_router.include_router(staff_router, tags=["staff"])
