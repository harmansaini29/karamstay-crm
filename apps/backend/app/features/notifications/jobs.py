import logging

from app.core.scheduler import register_daily_job
from app.core.security import utc_now
from app.db.session import SessionLocal
from app.features.notifications.dispatcher import notify_push_all_devices, notify_whatsapp
from app.features.payments.repository import PaymentRepository
from app.features.settings.keys import (
    KEY_WHATSAPP_GENERIC_NOTICE_TEMPLATE,
    get_agreement_reminder_days,
    get_whatsapp_template,
)
from app.features.tenants.models import Tenant

logger = logging.getLogger("karamstay.notifications.jobs")


def check_agreement_expiry() -> None:
    db = SessionLocal()
    try:
        repository = PaymentRepository(db)
        reminder_days = get_agreement_reminder_days(db)
        template_name = get_whatsapp_template(db, KEY_WHATSAPP_GENERIC_NOTICE_TEMPLATE)
        today = utc_now().date()
        notified = 0
        for tenancy in repository.list_active_tenancies():
            if tenancy.end_date is None:
                continue
            days_remaining = (tenancy.end_date - today).days
            if days_remaining not in reminder_days:
                continue
            tenant = db.get(Tenant, tenancy.tenant_id)
            if tenant is None:
                continue
            message = f"Your rental agreement expires in {days_remaining} day(s) on {tenancy.end_date}."
            notify_whatsapp(
                db,
                user_id=tenant.user_id,
                phone=tenant.phone,
                notification_type="agreement_expiry",
                title="Agreement Expiring Soon",
                message=message,
                template_name=template_name,
            )
            if tenant.user_id is not None:
                notify_push_all_devices(
                    db,
                    user_id=tenant.user_id,
                    notification_type="agreement_expiry",
                    title="Agreement Expiring Soon",
                    message=message,
                )
            notified += 1
        logger.info("Agreement expiry job notified %s tenant(s)", notified)
    finally:
        db.close()


def register_notification_jobs() -> None:
    register_daily_job(job_id="check_agreement_expiry", hour=3, minute=0, func=check_agreement_expiry)
