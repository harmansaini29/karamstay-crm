import logging
import time
from collections.abc import Callable
from typing import Any

logger = logging.getLogger("karamstay.notify.dispatch")

DEFAULT_RETRY_DELAYS: tuple[float, ...] = (1, 2, 4)


def send_with_retry(
    send_fn: Callable[..., dict[str, Any]],
    *args: Any,
    delays: tuple[float, ...] = DEFAULT_RETRY_DELAYS,
    **kwargs: Any,
) -> dict[str, Any]:
    """Runs send_fn, retrying on exceptions with the given backoff delays.

    A "skipped" result (channel not configured) is returned immediately without
    retrying, since retrying can't fix a missing credential.
    """
    last_error: str | None = None
    attempts = len(delays) + 1
    for attempt in range(attempts):
        if attempt > 0:
            time.sleep(delays[attempt - 1])
        try:
            result = send_fn(*args, **kwargs)
        except Exception as exc:  # noqa: BLE001 - any transport failure should retry
            last_error = str(exc)
            logger.warning("Notification send attempt %s/%s failed: %s", attempt + 1, attempts, exc)
            continue
        if result.get("status") == "skipped":
            return result
        return {**result, "attempts": attempt + 1}

    return {"status": "failed", "error": last_error, "attempts": attempts}
