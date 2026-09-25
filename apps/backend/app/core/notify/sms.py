import logging
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger("karamstay.notify.sms")


class SMSSendError(Exception):
    pass


def is_sms_configured() -> bool:
    """Check if any SMS gateway provider is configured with valid credentials."""
    provider = (settings.sms_gateway_provider or "").lower().strip()
    if provider == "fast2sms" or settings.fast2sms_api_key:
        key = (settings.fast2sms_api_key or "").strip()
        if key and key != "REPLACE_ME":
            return True

    if provider == "msg91" or settings.msg91_auth_key:
        key = (settings.msg91_auth_key or "").strip()
        if key and key != "REPLACE_ME":
            return True

    if provider == "twilio" or (settings.twilio_account_sid and settings.twilio_auth_token):
        sid = (settings.twilio_account_sid or "").strip()
        token = (settings.twilio_auth_token or "").strip()
        if sid and sid != "REPLACE_ME" and token and token != "REPLACE_ME":
            return True

    return False


def send_sms(*, to: str, message: str) -> dict[str, Any]:
    """Send an SMS notification or OTP via Fast2SMS, MSG91, Twilio, or mock provider.

    Returns {"status": "skipped", ...} when no provider is configured.
    """
    if not is_sms_configured():
        logger.warning("SMS gateway not configured; skipping SMS send to %s", to)
        return {"status": "skipped", "reason": "not_configured"}

    clean_phone = "".join(c for c in to if c.isdigit())
    if len(clean_phone) > 10:
        clean_phone = clean_phone[-10:]

    provider = (settings.sms_gateway_provider or "").lower().strip()

    # 1. Fast2SMS Provider (India Quick SMS / OTP API)
    if provider == "fast2sms" or (settings.fast2sms_api_key and settings.fast2sms_api_key != "REPLACE_ME"):
        url = "https://www.fast2sms.com/dev/bulkV2"
        headers = {
            "authorization": settings.fast2sms_api_key,
            "Content-Type": "application/json",
        }
        payload = {
            "route": "v3",
            "sender_id": "TXTIND",
            "message": message,
            "language": "english",
            "flash": 0,
            "numbers": clean_phone,
        }
        try:
            res = httpx.post(url, json=payload, headers=headers, timeout=10)
            res.raise_for_status()
            logger.info("SMS successfully sent via Fast2SMS to %s", clean_phone)
            return {"status": "sent", "provider": "fast2sms", "response": res.json()}
        except Exception as exc:
            logger.error("Fast2SMS gateway error for %s: %s", clean_phone, exc)
            raise SMSSendError(f"Fast2SMS send failed: {exc}") from exc

    # 2. MSG91 Provider (India Enterprise SMS)
    if provider == "msg91" or (settings.msg91_auth_key and settings.msg91_auth_key != "REPLACE_ME"):
        url = "https://control.msg91.com/api/v5/flow"
        headers = {
            "authkey": settings.msg91_auth_key,
            "content-type": "application/json",
        }
        sender = settings.msg91_sender_id or "KRMSTY"
        payload = {
            "sender": sender,
            "mobiles": f"91{clean_phone}",
            "message": message,
        }
        try:
            res = httpx.post(url, json=payload, headers=headers, timeout=10)
            res.raise_for_status()
            logger.info("SMS successfully sent via MSG91 to %s", clean_phone)
            return {"status": "sent", "provider": "msg91", "response": res.json()}
        except Exception as exc:
            logger.error("MSG91 gateway error for %s: %s", clean_phone, exc)
            raise SMSSendError(f"MSG91 send failed: {exc}") from exc

    # 3. Twilio Provider (Global SMS)
    if provider == "twilio" or (settings.twilio_account_sid and settings.twilio_auth_token):
        sid = settings.twilio_account_sid
        token = settings.twilio_auth_token
        from_phone = settings.twilio_from_phone or "+1234567890"
        dest_phone = to if to.startswith("+") else f"+91{clean_phone}"
        url = f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json"
        try:
            res = httpx.post(
                url,
                data={"From": from_phone, "To": dest_phone, "Body": message},
                auth=(sid, token),
                timeout=10,
            )
            res.raise_for_status()
            logger.info("SMS successfully sent via Twilio to %s", dest_phone)
            return {"status": "sent", "provider": "twilio", "response": res.json()}
        except Exception as exc:
            logger.error("Twilio gateway error for %s: %s", dest_phone, exc)
            raise SMSSendError(f"Twilio send failed: {exc}") from exc

    return {"status": "skipped", "reason": "no_matching_provider"}
