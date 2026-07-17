"""documents module: approval status workflow

Revision ID: 20260718_0008
Revises: 20260718_0007
Create Date: 2026-07-18
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260718_0008"
down_revision: str | None = "20260718_0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("documents", sa.Column("status", sa.String(24), nullable=False, server_default="pending"))
    op.add_column("documents", sa.Column("status_updated_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("documents", sa.Column("status_updated_by_id", sa.BigInteger(), nullable=True))
    op.add_column("documents", sa.Column("rejection_reason", sa.Text(), nullable=True))
    op.create_foreign_key(
        "fk_documents_status_updated_by_id_users",
        "documents",
        "users",
        ["status_updated_by_id"],
        ["id"],
    )
    op.create_index("ix_documents_status", "documents", ["status"])

    # Documents uploaded before this workflow existed predate any approval step;
    # treat them as already approved rather than retroactively blocking on them.
    op.execute("UPDATE documents SET status = 'approved' WHERE status = 'pending'")


def downgrade() -> None:
    op.drop_index("ix_documents_status", table_name="documents")
    op.drop_constraint("fk_documents_status_updated_by_id_users", "documents", type_="foreignkey")
    op.drop_column("documents", "rejection_reason")
    op.drop_column("documents", "status_updated_by_id")
    op.drop_column("documents", "status_updated_at")
    op.drop_column("documents", "status")
