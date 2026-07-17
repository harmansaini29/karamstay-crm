import logging
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger("karamstay.notify.whatsapp")


class WhatsAppSendError(Exception):
    pass


def is_configured() -> bool:
    return bool(settings.whatsapp_cloud_api_token and settings.whatsapp_phone_number_id)


def send_template_message(
    *,
    to: str,
    template_name: str,
    language_code: str = "en_US",
    components: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Send a pre-approved WhatsApp template message via the Meta Cloud API.

    Returns {"status": "skipped", ...} when credentials are not configured, so
    callers (e.g. OTP delivery) can run in local/test environments without a
    live WhatsApp Business account.
    """
    if not is_configured():
        logger.warning("WhatsApp Cloud API not configured; skipping send to %s (%s)", to, template_name)
        return {"status": "skipped", "reason": "not_configured"}

    url = f"{settings.whatsapp_api_base_url}/{settings.whatsapp_phone_number_id}/messages"
    payload: dict[str, Any] = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "template",
        "template": {
            "name": template_name,
            "language": {"code": language_code},
        },
    }
    if components:
        payload["template"]["components"] = components

    headers = {"Authorization": f"Bearer {settings.whatsapp_cloud_api_token}"}
    try:
        response = httpx.post(url, json=payload, headers=headers, timeout=10)
        response.raise_for_status()
    except httpx.HTTPError as exc:
        logger.error("WhatsApp send failed for %s: %s", to, exc)
        raise WhatsAppSendError(str(exc)) from exc
    return {"status": "sent", "response": response.json()}
