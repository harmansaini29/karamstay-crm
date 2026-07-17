from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool

from alembic import context
from app.core.config import settings
from app.db.base import Base
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

config = context.config
config.set_main_option("sqlalchemy.url", settings.database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=settings.database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
