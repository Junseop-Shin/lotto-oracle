from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
import pytz

scheduler = AsyncIOScheduler(timezone=pytz.timezone("Asia/Seoul"))


def setup_scheduler():
    from src.fetcher  import fetch_latest
    from src.analyzer import compute_and_save_all, rebuild_all_caches
    from src.database import get_latest_draw_no, get_cache

    async def job_fetch_latest():
        """매주 토요일 22:00 — 최신 회차 fetch + 예측 재계산."""
        data = await fetch_latest()
        if data:
            compute_and_save_all()   # 새 회차 반영한 예측 저장

    async def job_health_check():
        """매주 토요일 22:10 — 캐시 정합성 검사 + 필요 시 재계산."""
        latest = get_latest_draw_no()
        stale  = any(
            not (c := get_cache(key)) or c["based_on"] != latest
            for key in ["cooccurrence", "conditional", "markov"]
        )
        if stale:
            compute_and_save_all()

    scheduler.add_job(job_fetch_latest, CronTrigger(day_of_week="sat", hour=22, minute=0))
    scheduler.add_job(job_health_check, CronTrigger(day_of_week="sat", hour=22, minute=10))
    scheduler.start()
