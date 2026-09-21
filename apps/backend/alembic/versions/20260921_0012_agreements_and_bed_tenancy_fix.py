"""agreements tables and bed tenancy partial index fix

Revision ID: 20260921_0012
Revises: 20260906_0011
Create Date: 2026-09-21
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260921_0012"
down_revision: str | None = "20260906_0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Fix tenancies active-unit partial index so multi-bed units can host multiple bed-level tenancies.
    # The old index blocked any second tenancy on the same unit regardless of bed_ids.
    op.drop_index("uq_tenancies_active_unit", table_name="tenancies", if_exists=True)
    op.create_index(
        "uq_tenancies_active_whole_unit",
        "tenancies",
        ["unit_id"],
        unique=True,
        postgresql_where=sa.text("status = 'active' AND deleted_at IS NULL AND bed_ids IS NULL"),
    )

    # 2. Create agreements table
    op.create_table(
        "agreements",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("tenancy_id", sa.BigInteger(), sa.ForeignKey("tenancies.id"), nullable=False),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("template_id", sa.String(length=4), nullable=False, server_default="A"),
        sa.Column("template_name", sa.String(length=120), nullable=False, server_default="Standard Agreement"),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="form_submitted"),
        sa.Column("form_data", sa.JSON(), nullable=True),
        sa.Column("docx_file_name", sa.String(length=255), nullable=True),
        sa.Column("docx_generated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("tracker_stage", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by_id", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("updated_by_id", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=True),
    )
    op.create_index("ix_agreements_tenancy_id", "agreements", ["tenancy_id"])
    op.create_index("ix_agreements_tenant_id", "agreements", ["tenant_id"])

    # 3. Create agreement_offline_uploads table
    op.create_table(
        "agreement_offline_uploads",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("agreement_id", sa.BigInteger(), sa.ForeignKey("agreements.id"), nullable=False),
        sa.Column("upload_type", sa.String(length=32), nullable=False),
        sa.Column("file_name", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="PENDING"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("created_by_id", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("updated_by_id", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=True),
    )
    op.create_index("ix_agreement_offline_uploads_agreement_id", "agreement_offline_uploads", ["agreement_id"])


def downgrade() -> None:
    op.drop_table("agreement_offline_uploads")
    op.drop_table("agreements")
    op.drop_index("uq_tenancies_active_whole_unit", table_name="tenancies", if_exists=True)
    op.create_index(
        "uq_tenancies_active_unit",
        "tenancies",
        ["unit_id"],
        unique=True,
        postgresql_where=sa.text("status = 'active' AND deleted_at IS NULL"),
    )
