import json
import logging
from typing import Any

import firebase_admin
from firebase_admin import credentials, messaging

from app.core.config import settings

logger = logging.getLogger("karamstay.notify.fcm")

_app: firebase_admin.App | None = None
_init_attempted = False


def is_configured() -> bool:
    return bool(settings.firebase_service_account_file or settings.firebase_service_account_json)


def _get_app() -> firebase_admin.App | None:
    global _app, _init_attempted
    if _app is not None or _init_attempted:
        return _app
    _init_attempted = True
    if not is_configured():
        return None

    if settings.firebase_service_account_file:
        cred = credentials.Certificate(settings.firebase_service_account_file)
    else:
        cred = credentials.Certificate(json.loads(settings.firebase_service_account_json))
    _app = firebase_admin.initialize_app(cred)
    return _app


def send_push(*, token: str, title: str, body: str, data: dict[str, str] | None = None) -> dict[str, Any]:
    app = _get_app()
    if app is None:
        logger.warning("FCM not configured; skipping push to %s", token)
        return {"status": "skipped", "reason": "not_configured"}

    message = messaging.Message(
        token=token,
        notification=messaging.Notification(title=title, body=body),
        data=data or {},
    )
    message_id = messaging.send(message, app=app)
    return {"status": "sent", "message_id": message_id}
