"""smart collect virtual accounts cms columns

Revision ID: 20261010_0014
Revises: 20260925_0013
Create Date: 2026-10-10
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20261010_0014"
down_revision: str | None = "20260925_0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Tenancies virtual account columns
    op.add_column("tenancies", sa.Column("virtual_account_number", sa.String(length=64), nullable=True))
    op.add_column("tenancies", sa.Column("virtual_ifsc", sa.String(length=16), nullable=True))
    op.add_column("tenancies", sa.Column("virtual_vpa", sa.String(length=120), nullable=True))
    op.add_column("tenancies", sa.Column("bank_provider", sa.String(length=32), nullable=True))
    op.create_index("ix_tenancies_virtual_account_number", "tenancies", ["virtual_account_number"])

    # 2. Tenants virtual account columns
    op.add_column("tenants", sa.Column("virtual_account_number", sa.String(length=64), nullable=True))
    op.add_column("tenants", sa.Column("virtual_ifsc", sa.String(length=16), nullable=True))
    op.add_column("tenants", sa.Column("virtual_vpa", sa.String(length=120), nullable=True))
    op.add_column("tenants", sa.Column("bank_provider", sa.String(length=32), nullable=True))
    op.create_index("ix_tenants_virtual_account_number", "tenants", ["virtual_account_number"])

    # 3. Properties bank provider
    op.add_column("properties", sa.Column("bank_provider", sa.String(length=32), nullable=True))

    # 4. Payments Smart Collect columns
    op.add_column("payments", sa.Column("virtual_account_number", sa.String(length=64), nullable=True))
    op.add_column("payments", sa.Column("bank_reference", sa.String(length=100), nullable=True))
    op.add_column("payments", sa.Column("raw_webhook_payload", sa.JSON(), nullable=True))
    op.create_index("ix_payments_virtual_account_number", "payments", ["virtual_account_number"])
    op.create_index("ix_payments_bank_reference", "payments", ["bank_reference"])


def downgrade() -> None:
    op.drop_index("ix_payments_bank_reference", table_name="payments")
    op.drop_index("ix_payments_virtual_account_number", table_name="payments")
    op.drop_column("payments", "raw_webhook_payload")
    op.drop_column("payments", "bank_reference")
    op.drop_column("payments", "virtual_account_number")

    op.drop_column("properties", "bank_provider")

    op.drop_index("ix_tenants_virtual_account_number", table_name="tenants")
    op.drop_column("tenants", "bank_provider")
    op.drop_column("tenants", "virtual_vpa")
    op.drop_column("tenants", "virtual_ifsc")
    op.drop_column("tenants", "virtual_account_number")

    op.drop_index("ix_tenancies_virtual_account_number", table_name="tenancies")
    op.drop_column("tenancies", "bank_provider")
    op.drop_column("tenancies", "virtual_vpa")
    op.drop_column("tenancies", "virtual_ifsc")
    op.drop_column("tenancies", "virtual_account_number")
