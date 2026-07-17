"""properties module: add latitude/longitude to units

Revision ID: 20260718_0006
Revises: 20260709_0005
Create Date: 2026-07-18
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260718_0006"
down_revision: str | None = "20260709_0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("units", sa.Column("latitude", sa.Float(), nullable=True))
    op.add_column("units", sa.Column("longitude", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("units", "longitude")
    op.drop_column("units", "latitude")
