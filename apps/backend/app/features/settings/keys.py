import json
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.config import settings as app_settings
from app.features.settings.repository import SettingsRepository

KEY_LATE_FEE_GRACE_DAYS = "late_fee_grace_days"
KEY_LATE_FEE_PERCENT_PER_DAY = "late_fee_percent_per_day"
KEY_AGREEMENT_REMINDER_DAYS = "agreement_reminder_days"
KEY_BRAND_NAME = "brand_name"
KEY_WHATSAPP_OTP_TEMPLATE = "whatsapp_otp_template"
KEY_WHATSAPP_PAYMENT_CONFIRMATION_TEMPLATE = "whatsapp_payment_confirmation_template"
KEY_WHATSAPP_GENERIC_NOTICE_TEMPLATE = "whatsapp_generic_notice_template"
KEY_OWNER_UPI_VPA = "owner_upi_vpa"
KEY_PAYEE_NAME = "payee_name"
KEY_GRIEVANCE_OFFICER_NAME = "grievance_officer_name"
KEY_GRIEVANCE_OFFICER_EMAIL = "grievance_officer_email"
KEY_GRIEVANCE_OFFICER_PHONE = "grievance_officer_phone"

DEFAULTS: dict[str, str] = {
    KEY_LATE_FEE_GRACE_DAYS: str(app_settings.late_fee_grace_days),
    KEY_LATE_FEE_PERCENT_PER_DAY: str(app_settings.late_fee_percent_per_day),
    KEY_AGREEMENT_REMINDER_DAYS: json.dumps([30, 15, 7, 1]),
    KEY_BRAND_NAME: app_settings.app_name,
    KEY_WHATSAPP_OTP_TEMPLATE: "karamstay_otp_login",
    KEY_WHATSAPP_PAYMENT_CONFIRMATION_TEMPLATE: "karamstay_payment_confirmation",
    KEY_WHATSAPP_GENERIC_NOTICE_TEMPLATE: "karamstay_generic_notice",
    KEY_OWNER_UPI_VPA: "",
    KEY_PAYEE_NAME: app_settings.app_name,
    KEY_GRIEVANCE_OFFICER_NAME: "",
    KEY_GRIEVANCE_OFFICER_EMAIL: "",
    KEY_GRIEVANCE_OFFICER_PHONE: "",
}


def get_value(db: Session, key: str) -> str:
    return SettingsRepository(db).get(key) or DEFAULTS[key]


def get_late_fee_config(db: Session) -> tuple[int, Decimal]:
    grace_days = int(get_value(db, KEY_LATE_FEE_GRACE_DAYS))
    percent = Decimal(get_value(db, KEY_LATE_FEE_PERCENT_PER_DAY))
    return grace_days, percent


def get_agreement_reminder_days(db: Session) -> list[int]:
    return json.loads(get_value(db, KEY_AGREEMENT_REMINDER_DAYS))


def get_whatsapp_template(db: Session, key: str) -> str:
    return get_value(db, key)
