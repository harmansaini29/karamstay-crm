import logging
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger("karamstay.notify.sms")


class SMSSendError(Exception):
    pass


def _has_fast2sms() -> bool:
    key = (settings.fast2sms_api_key or "").strip()
    return bool(key and key != "REPLACE_ME")


def _has_msg91() -> bool:
    key = (settings.msg91_auth_key or "").strip()
    return bool(key and key != "REPLACE_ME")


def _has_twilio() -> bool:
    sid = (settings.twilio_account_sid or "").strip()
    token = (settings.twilio_auth_token or "").strip()
    return bool(sid and sid != "REPLACE_ME" and token and token != "REPLACE_ME")


def is_sms_configured() -> bool:
    """Check if any real SMS gateway provider has configured credentials."""
    return _has_fast2sms() or _has_msg91() or _has_twilio()


def _send_fast2sms(clean_phone: str, message: str) -> dict[str, Any]:
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
    res = httpx.post(url, json=payload, headers=headers, timeout=10)
    res.raise_for_status()
    data = res.json()
    if data.get("return") is False:
        err_msg = ", ".join(data.get("message") or ["Fast2SMS rejected delivery"])
        raise SMSSendError(f"Fast2SMS error: {err_msg}")
    logger.info("SMS successfully sent via Fast2SMS to %s", clean_phone)
    return {"status": "sent", "provider": "fast2sms", "response": data}


def _send_msg91(clean_phone: str, message: str) -> dict[str, Any]:
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
    res = httpx.post(url, json=payload, headers=headers, timeout=10)
    res.raise_for_status()
    data = res.json()
    if data.get("type") == "error":
        err_msg = data.get("message") or "MSG91 rejected delivery"
        raise SMSSendError(f"MSG91 error: {err_msg}")
    logger.info("SMS successfully sent via MSG91 to %s", clean_phone)
    return {"status": "sent", "provider": "msg91", "response": data}


def _send_twilio(to: str, clean_phone: str, message: str) -> dict[str, Any]:
    sid = settings.twilio_account_sid
    token = settings.twilio_auth_token
    from_phone = settings.twilio_from_phone or "+1234567890"
    dest_phone = to if to.startswith("+") else f"+91{clean_phone}"
    url = f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json"
    res = httpx.post(
        url,
        data={"From": from_phone, "To": dest_phone, "Body": message},
        auth=(sid, token),
        timeout=10,
    )
    res.raise_for_status()
    data = res.json()
    if data.get("error_code") is not None:
        raise SMSSendError(f"Twilio error {data.get('error_code')}: {data.get('error_message')}")
    logger.info("SMS successfully sent via Twilio to %s", dest_phone)
    return {"status": "sent", "provider": "twilio", "response": data}


def send_sms(*, to: str, message: str, strict: bool = False) -> dict[str, Any]:
    """Send an SMS notification or OTP via Fast2SMS, MSG91, Twilio with automatic failover.

    If configured providers fail or no credentials are set, falls back to free
    dev/console fallback, ensuring OTPs and notifications never crash or freeze.
    """
    clean_phone = "".join(c for c in to if c.isdigit())
    if len(clean_phone) > 10:
        clean_phone = clean_phone[-10:]

    # Build prioritized provider candidate list
    configured_providers: list[str] = []
    preferred = (settings.sms_gateway_provider or "").lower().strip()

    if preferred == "fast2sms" and _has_fast2sms():
        configured_providers.append("fast2sms")
    elif preferred == "msg91" and _has_msg91():
        configured_providers.append("msg91")
    elif preferred == "twilio" and _has_twilio():
        configured_providers.append("twilio")

    # Add other configured providers as fallbacks
    if _has_fast2sms() and "fast2sms" not in configured_providers:
        configured_providers.append("fast2sms")
    if _has_msg91() and "msg91" not in configured_providers:
        configured_providers.append("msg91")
    if _has_twilio() and "twilio" not in configured_providers:
        configured_providers.append("twilio")

    errors: list[str] = []

    # Attempt delivery across configured providers
    for provider in configured_providers:
        try:
            if provider == "fast2sms":
                return _send_fast2sms(clean_phone, message)
            if provider == "msg91":
                return _send_msg91(clean_phone, message)
            if provider == "twilio":
                return _send_twilio(to, clean_phone, message)
        except Exception as exc:
            logger.warning(
                "SMS delivery via provider '%s' failed for %s: %s; attempting next provider...",
                provider,
                clean_phone,
                exc,
            )
            errors.append(f"{provider}: {exc}")

    if strict and errors:
        raise SMSSendError(f"All SMS providers failed: {'; '.join(errors)}")

    # Free Dev / Fallback Provider (zero cost, zero credentials required)
    logger.info(
        "[FREE/DEV SMS FALLBACK] Recipient: %s | Message: %s | Previous Errors: %s",
        to,
        message,
        errors or "none (unconfigured)",
    )
    return {
        "status": "fallback",
        "provider": "dev_fallback",
        "to": to,
        "clean_phone": clean_phone,
        "message": message,
        "fallback_reason": "; ".join(errors) if errors else "gateway_unconfigured",
    }
