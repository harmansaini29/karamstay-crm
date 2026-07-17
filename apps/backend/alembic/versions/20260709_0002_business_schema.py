"""create business schema

Revision ID: 20260709_0002
Revises: 20260709_0001
Create Date: 2026-07-09
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260709_0002"
down_revision: str | None = "20260709_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def audit_actor_columns() -> list[sa.Column]:
    return [
        sa.Column("created_by_id", sa.BigInteger(), nullable=True),
        sa.Column("updated_by_id", sa.BigInteger(), nullable=True),
    ]


def timestamp_columns() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    ]


def soft_delete_column() -> sa.Column:
    return sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True)


def add_actor_fks(table_name: str) -> None:
    op.create_foreign_key(
        f"fk_{table_name}_created_by_id_users",
        table_name,
        "users",
        ["created_by_id"],
        ["id"],
    )
    op.create_foreign_key(
        f"fk_{table_name}_updated_by_id_users",
        table_name,
        "users",
        ["updated_by_id"],
        ["id"],
    )
    op.create_index(f"ix_{table_name}_created_by_id", table_name, ["created_by_id"])
    op.create_index(f"ix_{table_name}_updated_by_id", table_name, ["updated_by_id"])


def upgrade() -> None:
    op.create_table(
        "properties",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("owner_id", sa.BigInteger(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("address", sa.Text(), nullable=False),
        sa.Column("property_type", sa.String(length=40), nullable=False),
        sa.Column("city", sa.String(length=80), nullable=True),
        sa.Column("state", sa.String(length=80), nullable=True),
        sa.Column("pincode", sa.String(length=16), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        *audit_actor_columns(),
        *timestamp_columns(),
        soft_delete_column(),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], name="fk_properties_owner_id_users"),
    )
    op.create_index("ix_properties_owner_id", "properties", ["owner_id"])
    add_actor_fks("properties")

    op.create_table(
        "manager_property_assignments",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("manager_id", sa.BigInteger(), nullable=False),
        sa.Column("property_id", sa.BigInteger(), nullable=False),
        *timestamp_columns(),
        sa.ForeignKeyConstraint(["manager_id"], ["users.id"], name="fk_mpa_manager_id_users"),
        sa.ForeignKeyConstraint(["property_id"], ["properties.id"], name="fk_mpa_property_id_properties"),
        sa.UniqueConstraint("manager_id", "property_id", name="uq_manager_property_assignment"),
    )
    op.create_index("ix_manager_property_assignments_manager_id", "manager_property_assignments", ["manager_id"])
    op.create_index("ix_manager_property_assignments_property_id", "manager_property_assignments", ["property_id"])

    op.create_table(
        "units",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("property_id", sa.BigInteger(), nullable=False),
        sa.Column("building", sa.String(length=80), nullable=True),
        sa.Column("floor", sa.Integer(), nullable=True),
        sa.Column("unit_no", sa.String(length=40), nullable=False),
        sa.Column("unit_type", sa.String(length=20), nullable=False),
        sa.Column("rent", sa.Numeric(12, 2), nullable=False),
        sa.Column("deposit", sa.Numeric(12, 2), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="vacant"),
        sa.Column("capacity", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("notes", sa.Text(), nullable=True),
        *audit_actor_columns(),
        *timestamp_columns(),
        soft_delete_column(),
        sa.CheckConstraint("rent >= 0", name="ck_units_rent_non_negative"),
        sa.CheckConstraint("deposit >= 0", name="ck_units_deposit_non_negative"),
        sa.CheckConstraint("capacity > 0", name="ck_units_capacity_positive"),
        sa.ForeignKeyConstraint(["property_id"], ["properties.id"], name="fk_units_property_id_properties"),
        sa.UniqueConstraint("property_id", "building", "floor", "unit_no", name="uq_units_property_location"),
    )
    op.create_index("ix_units_property_id", "units", ["property_id"])
    op.create_index("ix_units_status", "units", ["status"])
    add_actor_fks("units")

    op.create_table(
        "tenants",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("user_id", sa.BigInteger(), nullable=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("phone", sa.String(length=32), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("date_of_birth", sa.Date(), nullable=True),
        sa.Column("occupation", sa.String(length=120), nullable=True),
        sa.Column("emergency_contact_name", sa.String(length=120), nullable=True),
        sa.Column("emergency_contact_phone", sa.String(length=32), nullable=True),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="active"),
        sa.Column("owner_notes", sa.Text(), nullable=True),
        *audit_actor_columns(),
        *timestamp_columns(),
        soft_delete_column(),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_tenants_user_id_users"),
        sa.UniqueConstraint("phone", name="uq_tenants_phone"),
    )
    op.create_index("ix_tenants_user_id", "tenants", ["user_id"])
    add_actor_fks("tenants")

    op.create_table(
        "tenancies",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), nullable=False),
        sa.Column("unit_id", sa.BigInteger(), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("move_out_date", sa.Date(), nullable=True),
        sa.Column("monthly_rent", sa.Numeric(12, 2), nullable=False),
        sa.Column("security_deposit", sa.Numeric(12, 2), nullable=False),
        sa.Column("billing_day", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="active"),
        *audit_actor_columns(),
        *timestamp_columns(),
        soft_delete_column(),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], name="fk_tenancies_tenant_id_tenants"),
        sa.ForeignKeyConstraint(["unit_id"], ["units.id"], name="fk_tenancies_unit_id_units"),
    )
    op.create_index("ix_tenancies_tenant_id", "tenancies", ["tenant_id"])
    op.create_index("ix_tenancies_unit_id", "tenancies", ["unit_id"])
    op.create_index("ix_tenancies_status", "tenancies", ["status"])
    add_actor_fks("tenancies")

    op.create_table(
        "leads",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("property_id", sa.BigInteger(), nullable=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("phone", sa.String(length=32), nullable=False),
        sa.Column("budget", sa.Numeric(12, 2), nullable=True),
        sa.Column("source", sa.String(length=80), nullable=True),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="new"),
        sa.Column("notes", sa.Text(), nullable=True),
        *audit_actor_columns(),
        *timestamp_columns(),
        soft_delete_column(),
        sa.ForeignKeyConstraint(["property_id"], ["properties.id"], name="fk_leads_property_id_properties"),
    )
    add_actor_fks("leads")

    op.create_table(
        "bookings",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("lead_id", sa.BigInteger(), nullable=True),
        sa.Column("tenant_id", sa.BigInteger(), nullable=True),
        sa.Column("unit_id", sa.BigInteger(), nullable=False),
        sa.Column("token_amount", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="pending"),
        sa.Column("booked_until", sa.DateTime(timezone=True), nullable=True),
        *audit_actor_columns(),
        *timestamp_columns(),
        soft_delete_column(),
        sa.ForeignKeyConstraint(["lead_id"], ["leads.id"], name="fk_bookings_lead_id_leads"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], name="fk_bookings_tenant_id_tenants"),
        sa.ForeignKeyConstraint(["unit_id"], ["units.id"], name="fk_bookings_unit_id_units"),
    )
    op.create_index("ix_bookings_unit_id", "bookings", ["unit_id"])
    add_actor_fks("bookings")

    op.create_table(
        "invoices",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("tenancy_id", sa.BigInteger(), nullable=False),
        sa.Column("billing_period", sa.String(length=7), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("late_fee_amount", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="pending"),
        *audit_actor_columns(),
        *timestamp_columns(),
        soft_delete_column(),
        sa.ForeignKeyConstraint(["tenancy_id"], ["tenancies.id"], name="fk_invoices_tenancy_id_tenancies"),
        sa.UniqueConstraint("tenancy_id", "billing_period", name="uq_invoices_tenancy_period"),
    )
    op.create_index("ix_invoices_tenancy_id", "invoices", ["tenancy_id"])
    op.create_index("ix_invoices_due_date", "invoices", ["due_date"])
    op.create_index("ix_invoices_status", "invoices", ["status"])
    add_actor_fks("invoices")

    op.create_table(
        "payments",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("invoice_id", sa.BigInteger(), nullable=True),
        sa.Column("tenancy_id", sa.BigInteger(), nullable=True),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("payment_type", sa.String(length=32), nullable=False),
        sa.Column("mode", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="pending"),
        sa.Column("razorpay_order_id", sa.String(length=120), nullable=True),
        sa.Column("razorpay_payment_id", sa.String(length=120), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        *audit_actor_columns(),
        *timestamp_columns(),
        soft_delete_column(),
        sa.ForeignKeyConstraint(["invoice_id"], ["invoices.id"], name="fk_payments_invoice_id_invoices"),
        sa.ForeignKeyConstraint(["tenancy_id"], ["tenancies.id"], name="fk_payments_tenancy_id_tenancies"),
        sa.UniqueConstraint("razorpay_order_id", name="uq_payments_razorpay_order_id"),
        sa.UniqueConstraint("razorpay_payment_id", name="uq_payments_razorpay_payment_id"),
    )
    op.create_index("ix_payments_invoice_id", "payments", ["invoice_id"])
    add_actor_fks("payments")

    op.create_table(
        "ledger_entries",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("tenancy_id", sa.BigInteger(), nullable=False),
        sa.Column("payment_id", sa.BigInteger(), nullable=True),
        sa.Column("entry_type", sa.String(length=32), nullable=False),
        sa.Column("direction", sa.String(length=8), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("occurred_on", sa.Date(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        *audit_actor_columns(),
        *timestamp_columns(),
        soft_delete_column(),
        sa.ForeignKeyConstraint(["tenancy_id"], ["tenancies.id"], name="fk_ledger_entries_tenancy_id_tenancies"),
        sa.ForeignKeyConstraint(["payment_id"], ["payments.id"], name="fk_ledger_entries_payment_id_payments"),
    )
    op.create_index("ix_ledger_entries_tenancy_id", "ledger_entries", ["tenancy_id"])
    add_actor_fks("ledger_entries")

    op.create_table(
        "documents",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), nullable=True),
        sa.Column("property_id", sa.BigInteger(), nullable=True),
        sa.Column("document_type", sa.String(length=60), nullable=False),
        sa.Column("file_key", sa.String(length=512), nullable=False),
        sa.Column("file_name", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=120), nullable=False),
        sa.Column("uploaded_by_id", sa.BigInteger(), nullable=True),
        *audit_actor_columns(),
        *timestamp_columns(),
        soft_delete_column(),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], name="fk_documents_tenant_id_tenants"),
        sa.ForeignKeyConstraint(["property_id"], ["properties.id"], name="fk_documents_property_id_properties"),
        sa.ForeignKeyConstraint(["uploaded_by_id"], ["users.id"], name="fk_documents_uploaded_by_id_users"),
    )
    op.create_index("ix_documents_tenant_id", "documents", ["tenant_id"])
    op.create_index("ix_documents_property_id", "documents", ["property_id"])
    add_actor_fks("documents")

    op.create_table(
        "expenses",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("property_id", sa.BigInteger(), nullable=False),
        sa.Column("category", sa.String(length=80), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("expense_date", sa.Date(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("receipt_document_id", sa.BigInteger(), nullable=True),
        *audit_actor_columns(),
        *timestamp_columns(),
        soft_delete_column(),
        sa.ForeignKeyConstraint(["property_id"], ["properties.id"], name="fk_expenses_property_id_properties"),
        sa.ForeignKeyConstraint(
            ["receipt_document_id"],
            ["documents.id"],
            name="fk_expenses_receipt_document_id_documents",
        ),
    )
    op.create_index("ix_expenses_property_id", "expenses", ["property_id"])
    add_actor_fks("expenses")

    op.create_table(
        "inventory_items",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("unit_id", sa.BigInteger(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("condition", sa.String(length=40), nullable=False, server_default="good"),
        sa.Column("damage_fine_amount", sa.Numeric(12, 2), nullable=False, server_default="0"),
        *audit_actor_columns(),
        *timestamp_columns(),
        soft_delete_column(),
        sa.ForeignKeyConstraint(["unit_id"], ["units.id"], name="fk_inventory_items_unit_id_units"),
    )
    op.create_index("ix_inventory_items_unit_id", "inventory_items", ["unit_id"])
    add_actor_fks("inventory_items")

    op.create_table(
        "maintenance_tickets",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), nullable=True),
        sa.Column("unit_id", sa.BigInteger(), nullable=False),
        sa.Column("category", sa.String(length=60), nullable=False),
        sa.Column("priority", sa.String(length=24), nullable=False, server_default="medium"),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="open"),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("assigned_to_id", sa.BigInteger(), nullable=True),
        sa.Column("cost", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        *audit_actor_columns(),
        *timestamp_columns(),
        soft_delete_column(),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], name="fk_maintenance_tickets_tenant_id_tenants"),
        sa.ForeignKeyConstraint(["unit_id"], ["units.id"], name="fk_maintenance_tickets_unit_id_units"),
        sa.ForeignKeyConstraint(["assigned_to_id"], ["users.id"], name="fk_maintenance_tickets_assigned_to_id_users"),
    )
    op.create_index("ix_maintenance_tickets_tenant_id", "maintenance_tickets", ["tenant_id"])
    op.create_index("ix_maintenance_tickets_unit_id", "maintenance_tickets", ["unit_id"])
    op.create_index("ix_maintenance_tickets_status", "maintenance_tickets", ["status"])
    add_actor_fks("maintenance_tickets")

    op.create_table(
        "notifications",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("user_id", sa.BigInteger(), nullable=True),
        sa.Column("channel", sa.String(length=24), nullable=False),
        sa.Column("notification_type", sa.String(length=60), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="pending"),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        *audit_actor_columns(),
        *timestamp_columns(),
        soft_delete_column(),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_notifications_user_id_users"),
    )
    op.create_index("ix_notifications_user_id", "notifications", ["user_id"])
    add_actor_fks("notifications")

    op.create_table(
        "audit_logs",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("user_id", sa.BigInteger(), nullable=True),
        sa.Column("action", sa.String(length=80), nullable=False),
        sa.Column("entity_type", sa.String(length=80), nullable=False),
        sa.Column("entity_id", sa.BigInteger(), nullable=True),
        sa.Column("metadata_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_audit_logs_user_id_users"),
    )
    op.create_index("ix_audit_logs_user_id", "audit_logs", ["user_id"])
    op.create_index("ix_audit_logs_entity", "audit_logs", ["entity_type", "entity_id"])

    op.create_table(
        "settings",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("key", sa.String(length=120), nullable=False),
        sa.Column("value", sa.Text(), nullable=False),
        *timestamp_columns(),
        sa.UniqueConstraint("key", name="uq_settings_key"),
    )


def downgrade() -> None:
    for table_name in [
        "settings",
        "audit_logs",
        "notifications",
        "maintenance_tickets",
        "inventory_items",
        "expenses",
        "documents",
        "ledger_entries",
        "payments",
        "invoices",
        "bookings",
        "leads",
        "tenancies",
        "tenants",
        "units",
        "manager_property_assignments",
        "properties",
    ]:
        op.drop_table(table_name)
