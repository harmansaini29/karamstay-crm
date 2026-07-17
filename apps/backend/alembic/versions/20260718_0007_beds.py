"""properties/tenants module: bed-level inventory and tenancy bed_ids

Revision ID: 20260718_0007
Revises: 20260718_0006
Create Date: 2026-07-18
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260718_0007"
down_revision: str | None = "20260718_0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "beds",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("unit_id", sa.BigInteger(), sa.ForeignKey("units.id"), nullable=False),
        sa.Column("bed_no", sa.String(20), nullable=False),
        sa.Column("status", sa.String(24), nullable=False, server_default="vacant"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by_id", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("updated_by_id", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=True),
        sa.UniqueConstraint("unit_id", "bed_no", name="uq_beds_unit_bed_no"),
    )
    op.create_index("ix_beds_unit_id", "beds", ["unit_id"])
    op.create_index("ix_beds_status", "beds", ["status"])
    op.create_index("ix_beds_created_by_id", "beds", ["created_by_id"])
    op.create_index("ix_beds_updated_by_id", "beds", ["updated_by_id"])

    op.add_column("tenancies", sa.Column("bed_ids", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("tenancies", "bed_ids")
    op.drop_index("ix_beds_updated_by_id", table_name="beds")
    op.drop_index("ix_beds_created_by_id", table_name="beds")
    op.drop_index("ix_beds_status", table_name="beds")
    op.drop_index("ix_beds_unit_id", table_name="beds")
    op.drop_table("beds")
