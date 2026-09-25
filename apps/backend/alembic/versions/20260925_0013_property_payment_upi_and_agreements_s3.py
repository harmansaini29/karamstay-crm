"""property payment upi id and agreement s3 archive columns

Revision ID: 20260925_0013
Revises: 20260921_0012
Create Date: 2026-09-25
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260925_0013"
down_revision: str | None = "20260921_0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Add per-property payment GPay / UPI ID
    op.add_column("properties", sa.Column("payment_upi_id", sa.String(length=120), nullable=True))

    # 2. Add S3 folder archive & KYC attachment keys to agreements table
    op.add_column("agreements", sa.Column("tenant_photo_key", sa.String(length=500), nullable=True))
    op.add_column("agreements", sa.Column("aadhar_card_key", sa.String(length=500), nullable=True))
    op.add_column("agreements", sa.Column("signature_key", sa.String(length=500), nullable=True))
    op.add_column("agreements", sa.Column("s3_folder_path", sa.String(length=500), nullable=True))
    op.add_column("agreements", sa.Column("s3_archive_url", sa.String(length=1000), nullable=True))

    # 3. Add S3 key and download URL to offline uploads
    op.add_column("agreement_offline_uploads", sa.Column("s3_key", sa.String(length=500), nullable=True))
    op.add_column("agreement_offline_uploads", sa.Column("file_url", sa.String(length=1000), nullable=True))


def downgrade() -> None:
    op.drop_column("agreement_offline_uploads", "file_url")
    op.drop_column("agreement_offline_uploads", "s3_key")
    op.drop_column("agreements", "s3_archive_url")
    op.drop_column("agreements", "s3_folder_path")
    op.drop_column("agreements", "signature_key")
    op.drop_column("agreements", "aadhar_card_key")
    op.drop_column("agreements", "tenant_photo_key")
    op.drop_column("properties", "payment_upi_id")
