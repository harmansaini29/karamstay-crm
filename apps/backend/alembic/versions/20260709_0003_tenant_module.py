"""tenant module: otp codes, one active tenancy per unit

Revision ID: 20260709_0003
Revises: 20260709_0002
Create Date: 2026-07-09
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260709_0003"
down_revision: str | None = "20260709_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "otp_codes",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("phone", sa.String(length=32), nullable=False),
        sa.Column("code_hash", sa.String(length=255), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_otp_codes_phone", "otp_codes", ["phone"])

    # Application code already enforces this at the service layer (required for
    # SQLite-backed tests, which cannot express a Postgres partial index); this
    # is the production-database backstop against the invariant being violated
    # by a bug or a concurrent request race.
    op.create_index(
        "uq_tenancies_active_unit",
        "tenancies",
        ["unit_id"],
        unique=True,
        postgresql_where=sa.text("status = 'active' AND deleted_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_tenancies_active_unit", table_name="tenancies")
    op.drop_index("ix_otp_codes_phone", table_name="otp_codes")
    op.drop_table("otp_codes")
