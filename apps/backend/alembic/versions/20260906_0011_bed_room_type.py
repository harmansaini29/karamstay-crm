"""properties module: add room_type to beds table for tiered 3-block capacity

Revision ID: 20260906_0011
Revises: 20260718_0010
Create Date: 2026-09-06
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260906_0011"
down_revision: str | None = "20260718_0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("beds", sa.Column("room_type", sa.String(32), nullable=True))
    op.create_index("ix_beds_room_type", "beds", ["room_type"])


def downgrade() -> None:
    op.drop_index("ix_beds_room_type", table_name="beds")
    op.drop_column("beds", "room_type")
