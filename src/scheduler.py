from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
import pytz

scheduler = AsyncIOScheduler(timezone=pytz.timezone("Asia/Seoul"))

def setup_scheduler():
    from src.fetcher import fetch_latest
    from src.analyzer import rebuild_all_caches, ensure_cache
    from src.database import get_latest_draw_no, get_cache

    async def job_fetch_latest():
        data = await fetch_latest()
        if data:
            ensure_cache()

    async def job_health_check():
        latest = get_latest_draw_no()
        for key in ["cooccurrence", "conditional", "markov"]:
            cache = get_cache(key)
            if not cache or cache["based_on"] != latest:
                rebuild_all_caches()
                break

    scheduler.add_job(job_fetch_latest, CronTrigger(day_of_week="sat", hour=21, minute=10))
    scheduler.add_job(job_health_check, CronTrigger(hour=3, minute=0))
    scheduler.start()
