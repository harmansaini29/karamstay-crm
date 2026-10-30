from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings

engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    # Lightsail Nano: keep 5 persistent connections, allow 5 burst overflow.
    # Total max = 10 connections; well within PostgreSQL Micro's 97-connection limit.
    pool_size=5,
    max_overflow=5,
    pool_timeout=30,  # seconds to wait for a connection before raising OperationalError
    connect_args={"options": "-c statement_timeout=10000"},  # 10 s hard query timeout
)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
