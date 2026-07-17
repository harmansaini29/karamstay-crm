import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Response, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.errors import install_error_handlers
from app.core.logging import configure_logging
from app.core.middleware import request_id_middleware
from app.core.rate_limit import install_rate_limiting
from app.core.scheduler import start_scheduler, stop_scheduler
from app.db.session import SessionLocal
from app.features.notifications.jobs import register_notification_jobs
from app.features.payments.jobs import register_payment_jobs

logger = logging.getLogger("karamstay.health")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    register_payment_jobs()
    register_notification_jobs()
    start_scheduler()
    yield
    stop_scheduler()


def create_app() -> FastAPI:
    configure_logging()
    app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)
    app.middleware("http")(request_id_middleware)
    install_error_handlers(app)
    install_rate_limiting(app)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[str(origin) for origin in settings.backend_cors_origins],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/healthz", tags=["health"])
    def healthz(response: Response) -> dict[str, str]:
        try:
            with SessionLocal() as db:
                db.execute(text("SELECT 1"))
        except Exception:
            logger.exception("Health check DB ping failed")
            response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
            return {"status": "unhealthy"}
        return {"status": "ok"}

    app.include_router(api_router, prefix="/api/v1")
    return app


app = create_app()
