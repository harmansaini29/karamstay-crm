"""payments module: manual UPI + UTR verification fields

Revision ID: 20260718_0009
Revises: 20260718_0008
Create Date: 2026-07-18
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260718_0009"
down_revision: str | None = "20260718_0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("payments", sa.Column("utr_number", sa.String(24), nullable=True))
    op.add_column("payments", sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("payments", sa.Column("verified_by_id", sa.BigInteger(), nullable=True))
    op.add_column("payments", sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("payments", sa.Column("rejection_reason", sa.Text(), nullable=True))
    op.create_foreign_key(
        "fk_payments_verified_by_id_users",
        "payments",
        "users",
        ["verified_by_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_payments_verified_by_id_users", "payments", type_="foreignkey")
    op.drop_column("payments", "rejection_reason")
    op.drop_column("payments", "verified_at")
    op.drop_column("payments", "verified_by_id")
    op.drop_column("payments", "submitted_at")
    op.drop_column("payments", "utr_number")
