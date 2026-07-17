import logging
from collections.abc import Callable

from apscheduler.schedulers.background import BackgroundScheduler

logger = logging.getLogger("karamstay.scheduler")

scheduler = BackgroundScheduler(timezone="UTC")


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
