import os

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://test:test@localhost:5432/test")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-with-at-least-32-characters")
os.environ.setdefault("RATE_LIMIT_ENABLED", "false")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.db.session import SessionLocal, get_db
from app.features.audit import models as audit_models  # noqa: F401
from app.features.auth import models as auth_models  # noqa: F401
from app.features.consents import models as consent_models  # noqa: F401
from app.features.documents import models as document_models  # noqa: F401
from app.features.maintenance import models as maintenance_models  # noqa: F401
from app.features.notifications import models as notification_models  # noqa: F401
from app.features.payments import models as payment_models  # noqa: F401
from app.features.properties import models as property_models  # noqa: F401
from app.features.settings import models as settings_models  # noqa: F401
from app.features.tenants import models as tenant_models  # noqa: F401
from app.main import app

engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False, expire_on_commit=False)

# Background jobs (app/features/*/jobs.py) call `SessionLocal()` directly rather
# than going through the `get_db` FastAPI dependency, so overriding only the
# dependency (as the `client` fixture below does) would leave them pointed at
# the real (unreachable in tests) Postgres engine. Repointing the shared
# sessionmaker's bind fixes this for every existing `from ... import SessionLocal`
# reference, since they all hold the same sessionmaker instance.
SessionLocal.configure(bind=engine)


@pytest.fixture()
def db_session():
    Base.metadata.create_all(engine)
    session = TestingSessionLocal()
    try:
        from tests.factories import seed_roles

        seed_roles(session)
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(engine)


@pytest.fixture()
def client(db_session):
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
