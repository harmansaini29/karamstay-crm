"""Live-integration smoke test for WhatsApp, Firebase push, and S3.

Run this once real credentials are in `.env` (or injected via SSM/env vars in a
deployed environment) to confirm each third-party integration actually works
end-to-end — not just against the fake/in-memory test doubles the pytest suite
uses. Each check no-ops cleanly (reports "not configured", doesn't fail) when
its credentials are absent, so this is safe to run in any environment.

Usage:
    python scripts/verify_live_integrations.py --whatsapp-to +919810000000 --fcm-token <device-token>

Both flags are optional — omit either to skip that specific check.
"""

import argparse
import sys
import uuid

from app.core.config import settings
from app.core.notify import fcm, whatsapp
from app.core.storage import get_storage


def check_whatsapp(to: str | None) -> bool:
    if not whatsapp.is_configured():
        print("[WhatsApp] SKIP — WHATSAPP_CLOUD_API_TOKEN / WHATSAPP_PHONE_NUMBER_ID not set.")
        return True
    if not to:
        print("[WhatsApp] SKIP — configured, but no --whatsapp-to number given to test with.")
        return True
    try:
        result = whatsapp.send_template_message(
            to=to,
            template_name=settings.app_name.lower() + "_otp_login",
        )
        print(f"[WhatsApp] OK — sent to {to}: {result}")
        return True
    except Exception as exc:  # noqa: BLE001 - this is a smoke test, report anything that goes wrong
        print(f"[WhatsApp] FAIL — {exc}")
        return False


def check_fcm(token: str | None) -> bool:
    if not fcm.is_configured():
        print("[Firebase] SKIP — FIREBASE_SERVICE_ACCOUNT_JSON / _FILE not set.")
        return True
    if not token:
        print("[Firebase] SKIP — configured, but no --fcm-token given to test with.")
        return True
    try:
        result = fcm.send_push(token=token, title="KaramStay live check", body="Integration verification ping.")
        print(f"[Firebase] OK — pushed to device: {result}")
        return True
    except Exception as exc:  # noqa: BLE001
        print(f"[Firebase] FAIL — {exc}")
        return False


def check_s3() -> bool:
    if not settings.aws_s3_bucket:
        print("[S3] SKIP — AWS_S3_BUCKET not set.")
        return True
    try:
        storage = get_storage()
        key = storage.build_key(prefix="_live_check", file_name=f"{uuid.uuid4().hex}.txt")
        payload = b"karamstay live integration check"
        storage.upload_bytes(key=key, data=payload, content_type="text/plain")

        download_url = storage.presign_download(key=key)
        storage.delete(key=key)
        print(f"[S3] OK — uploaded, presigned a download URL, and cleaned up. Key: {key}")
        print(f"[S3]     download_url (unused, just proving presign works): {download_url[:80]}...")
        return True
    except Exception as exc:  # noqa: BLE001
        print(f"[S3] FAIL — {exc}")
        return False


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--whatsapp-to", help="Phone number (E.164) to send a real WhatsApp test message to")
    parser.add_argument("--fcm-token", help="Real device FCM token to push a real test notification to")
    args = parser.parse_args()

    results = [
        check_whatsapp(args.whatsapp_to),
        check_fcm(args.fcm_token),
        check_s3(),
    ]

    if all(results):
        print("\nAll configured integrations passed (unconfigured ones were skipped, not tested).")
        return 0
    print("\nOne or more configured integrations failed — see FAIL lines above.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
