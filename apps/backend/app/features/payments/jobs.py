import logging
from datetime import timedelta
from decimal import Decimal

from app.core.scheduler import register_daily_job
from app.core.security import utc_now
from app.db.session import SessionLocal
from app.features.payments.models import Invoice
from app.features.payments.repository import PaymentRepository
from app.features.settings.keys import get_late_fee_config

logger = logging.getLogger("karamstay.payments.jobs")


def generate_due_invoices() -> None:
    db = SessionLocal()
    try:
        repository = PaymentRepository(db)
        today = utc_now().date()
        billing_period = today.strftime("%Y-%m")
        created = 0
        for tenancy in repository.list_active_tenancies():
            if tenancy.billing_day != today.day:
                continue
            if repository.get_invoice_for_period(tenancy.id, billing_period) is not None:
                continue
            invoice = Invoice(
                tenancy_id=tenancy.id,
                billing_period=billing_period,
                due_date=today,
                amount=tenancy.monthly_rent,
            )
            repository.add_invoice(invoice)
            created += 1
        db.commit()
        logger.info("Monthly invoice job created %s invoice(s) for %s", created, billing_period)
    finally:
        db.close()


def accrue_late_fees() -> None:
    db = SessionLocal()
    try:
        repository = PaymentRepository(db)
        grace_days, percent_per_day = get_late_fee_config(db)
        today = utc_now().date()
        grace_cutoff = today - timedelta(days=grace_days)
        updated = 0
        for invoice in repository.list_overdue_invoices(grace_cutoff):
            days_late = (today - invoice.due_date).days - grace_days
            if days_late <= 0:
                continue
            fee = (invoice.amount * percent_per_day / Decimal("100")) * days_late
            if fee != invoice.late_fee_amount:
                invoice.late_fee_amount = fee
                invoice.status = "overdue"
                updated += 1
        db.commit()
        logger.info("Late fee job updated %s invoice(s)", updated)
    finally:
        db.close()


def register_payment_jobs() -> None:
    register_daily_job(job_id="generate_due_invoices", hour=1, minute=0, func=generate_due_invoices)
    register_daily_job(job_id="accrue_late_fees", hour=2, minute=0, func=accrue_late_fees)
