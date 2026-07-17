"""consents module: DPDP consent log and data subject request queue

Revision ID: 20260718_0010
Revises: 20260718_0009
Create Date: 2026-07-18
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260718_0010"
down_revision: str | None = "20260718_0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "consents",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("consent_type", sa.String(60), nullable=False),
        sa.Column("granted", sa.Boolean(), nullable=False),
        sa.Column("policy_version", sa.String(20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_consents_user_id", "consents", ["user_id"])

    op.create_table(
        "data_requests",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("request_type", sa.String(20), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_data_requests_user_id", "data_requests", ["user_id"])
    op.create_index("ix_data_requests_status", "data_requests", ["status"])


def downgrade() -> None:
    op.drop_index("ix_data_requests_status", table_name="data_requests")
    op.drop_index("ix_data_requests_user_id", table_name="data_requests")
    op.drop_table("data_requests")

    op.drop_index("ix_consents_user_id", table_name="consents")
    op.drop_table("consents")
