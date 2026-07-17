"""maintenance module: link documents and expenses to maintenance tickets

Revision ID: 20260709_0005
Revises: 20260709_0004
Create Date: 2026-07-09
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260709_0005"
down_revision: str | None = "20260709_0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("documents", sa.Column("maintenance_ticket_id", sa.BigInteger(), nullable=True))
    op.create_foreign_key(
        "fk_documents_maintenance_ticket_id_maintenance_tickets",
        "documents",
        "maintenance_tickets",
        ["maintenance_ticket_id"],
        ["id"],
    )
    op.create_index("ix_documents_maintenance_ticket_id", "documents", ["maintenance_ticket_id"])

    op.add_column("expenses", sa.Column("maintenance_ticket_id", sa.BigInteger(), nullable=True))
    op.create_foreign_key(
        "fk_expenses_maintenance_ticket_id_maintenance_tickets",
        "expenses",
        "maintenance_tickets",
        ["maintenance_ticket_id"],
        ["id"],
    )
    op.create_index("ix_expenses_maintenance_ticket_id", "expenses", ["maintenance_ticket_id"])


def downgrade() -> None:
    op.drop_index("ix_expenses_maintenance_ticket_id", table_name="expenses")
    op.drop_constraint("fk_expenses_maintenance_ticket_id_maintenance_tickets", "expenses", type_="foreignkey")
    op.drop_column("expenses", "maintenance_ticket_id")

    op.drop_index("ix_documents_maintenance_ticket_id", table_name="documents")
    op.drop_constraint("fk_documents_maintenance_ticket_id_maintenance_tickets", "documents", type_="foreignkey")
    op.drop_column("documents", "maintenance_ticket_id")
