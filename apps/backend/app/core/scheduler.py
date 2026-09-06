import logging
from collections.abc import Callable
from typing import Any

logger = logging.getLogger("karamstay.scheduler")

try:
    from apscheduler.schedulers.background import BackgroundScheduler
    scheduler: Any = BackgroundScheduler(timezone="UTC")
except ImportError:
    class DummyScheduler:
        running = False
        def add_job(self, *args, **kwargs): pass
        def start(self): self.running = True
        def shutdown(self, *args, **kwargs): self.running = False
        def get_jobs(self): return []
    scheduler = DummyScheduler()


def register_daily_job(*, job_id: str, hour: int, minute: int, func: Callable[[], None]) -> None:
    scheduler.add_job(
        func,
        trigger="cron",
        hour=hour,
        minute=minute,
        id=job_id,
        replace_existing=True,
        misfire_grace_time=3600,
    )


def start_scheduler() -> None:
    if not scheduler.running:
        scheduler.start()
        logger.info("Scheduler started with jobs: %s", [job.id for job in scheduler.get_jobs()])


def stop_scheduler() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)
