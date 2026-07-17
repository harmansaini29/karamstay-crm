import json

from sqlalchemy.orm import Session

from app.core.audit import AuditLogService
from app.features.auth.models import User
from app.features.settings import keys
from app.features.settings.repository import SettingsRepository
from app.features.settings.schemas import SettingsResponse, SettingsUpdate

FIELD_TO_KEY = {
    "late_fee_grace_days": keys.KEY_LATE_FEE_GRACE_DAYS,
    "late_fee_percent_per_day": keys.KEY_LATE_FEE_PERCENT_PER_DAY,
    "agreement_reminder_days": keys.KEY_AGREEMENT_REMINDER_DAYS,
    "brand_name": keys.KEY_BRAND_NAME,
    "whatsapp_otp_template": keys.KEY_WHATSAPP_OTP_TEMPLATE,
    "whatsapp_payment_confirmation_template": keys.KEY_WHATSAPP_PAYMENT_CONFIRMATION_TEMPLATE,
    "whatsapp_generic_notice_template": keys.KEY_WHATSAPP_GENERIC_NOTICE_TEMPLATE,
    "owner_upi_vpa": keys.KEY_OWNER_UPI_VPA,
    "payee_name": keys.KEY_PAYEE_NAME,
    "grievance_officer_name": keys.KEY_GRIEVANCE_OFFICER_NAME,
    "grievance_officer_email": keys.KEY_GRIEVANCE_OFFICER_EMAIL,
    "grievance_officer_phone": keys.KEY_GRIEVANCE_OFFICER_PHONE,
}


class SettingsService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repository = SettingsRepository(db)
        self.audit = AuditLogService(db)

    def get_settings(self) -> SettingsResponse:
        grace_days, percent = keys.get_late_fee_config(self.db)
        return SettingsResponse(
            late_fee_grace_days=grace_days,
            late_fee_percent_per_day=percent,
            agreement_reminder_days=keys.get_agreement_reminder_days(self.db),
            brand_name=keys.get_value(self.db, keys.KEY_BRAND_NAME),
            whatsapp_otp_template=keys.get_value(self.db, keys.KEY_WHATSAPP_OTP_TEMPLATE),
            whatsapp_payment_confirmation_template=keys.get_value(
                self.db,
                keys.KEY_WHATSAPP_PAYMENT_CONFIRMATION_TEMPLATE,
            ),
            whatsapp_generic_notice_template=keys.get_value(self.db, keys.KEY_WHATSAPP_GENERIC_NOTICE_TEMPLATE),
            owner_upi_vpa=keys.get_value(self.db, keys.KEY_OWNER_UPI_VPA),
            payee_name=keys.get_value(self.db, keys.KEY_PAYEE_NAME),
            grievance_officer_name=keys.get_value(self.db, keys.KEY_GRIEVANCE_OFFICER_NAME),
            grievance_officer_email=keys.get_value(self.db, keys.KEY_GRIEVANCE_OFFICER_EMAIL),
            grievance_officer_phone=keys.get_value(self.db, keys.KEY_GRIEVANCE_OFFICER_PHONE),
        )

    def update_settings(self, payload: SettingsUpdate, current_user: User) -> SettingsResponse:
        update_data = payload.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            key = FIELD_TO_KEY[field]
            serialized = json.dumps(value) if isinstance(value, list) else str(value)
            self.repository.set(key, serialized)

        self.audit.record(
            user_id=current_user.id,
            action="settings.update",
            entity_type="settings",
            entity_id=None,
            metadata={k: str(v) for k, v in update_data.items()},
        )
        self.db.commit()
        return self.get_settings()
