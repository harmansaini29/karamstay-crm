"""add bank_account_key to properties table

Revision ID: 20261010_0015
Revises: 20261010_0014
Create Date: 2026-10-10
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20261010_0015"
down_revision: str | None = "20261010_0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "properties",
        sa.Column("bank_account_key", sa.String(length=32), nullable=True, server_default="hdfc_1"),
    )


def downgrade() -> None:
    op.drop_column("properties", "bank_account_key")
