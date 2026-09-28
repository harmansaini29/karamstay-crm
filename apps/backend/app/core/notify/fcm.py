import json
import logging
from typing import Any

try:
    import firebase_admin
    from firebase_admin import credentials, messaging
except ImportError:
    firebase_admin = None  # type: ignore
    credentials = None  # type: ignore
    messaging = None  # type: ignore

from app.core.config import settings

logger = logging.getLogger("karamstay.notify.fcm")

_app: Any = None
_init_attempted = False


def is_configured() -> bool:
    if firebase_admin is None:
        return False
    sa_json = (settings.firebase_service_account_json or "").strip()
    sa_file = (settings.firebase_service_account_file or "").strip()
    has_valid_json = bool(sa_json and sa_json != "REPLACE_ME" and sa_json.startswith("{"))
    has_valid_file = bool(sa_file and sa_file != "REPLACE_ME")
    return has_valid_json or has_valid_file


def _get_app() -> Any:
    global _app, _init_attempted
    if _app is not None or _init_attempted:
        return _app
    _init_attempted = True
    if not is_configured():
        return None

    try:
        if settings.firebase_service_account_file and settings.firebase_service_account_file != "REPLACE_ME":
            cred = credentials.Certificate(settings.firebase_service_account_file)
        else:
            cred = credentials.Certificate(json.loads(settings.firebase_service_account_json))
        _app = firebase_admin.initialize_app(cred)
    except Exception as exc:
        logger.warning("FCM initialization failed: %s; notifications will run in fallback mode", exc)
        _app = None
    return _app


def send_push(*, token: str, title: str, body: str, data: dict[str, str] | None = None) -> dict[str, Any]:
    app = _get_app()
    if app is None:
        logger.warning("FCM not configured; skipping push to %s", token)
        return {"status": "skipped", "reason": "not_configured"}

    try:
        message = messaging.Message(
            token=token,
            notification=messaging.Notification(title=title, body=body),
            data=data or {},
        )
        message_id = messaging.send(message, app=app)
        return {"status": "sent", "message_id": message_id}
    except Exception as exc:
        logger.warning("FCM push send error to %s: %s", token, exc)
        return {"status": "failed", "error": str(exc)}


def send_otp_push(*, token: str, code: str, expire_minutes: int = 10) -> dict[str, Any]:
    """Send OTP directly to tenant device via Firebase Cloud Messaging (free instant push channel)."""
    return send_push(
        token=token,
        title="KaramStay Verification Code",
        body=f"Your verification code is {code}. Valid for {expire_minutes} minutes.",
        data={
            "type": "otp_verification",
            "otp_code": code,
            "expire_minutes": str(expire_minutes),
        },
    )
