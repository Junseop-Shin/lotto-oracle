import os
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel, field_validator
from dotenv import load_dotenv
import httpx

load_dotenv()

from src.database import init_db, get_conn, get_latest_draw_no, get_predictions
from src import fetcher, analyzer
from src.scheduler import setup_scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    setup_scheduler()

    # DB가 비어있으면 시드 데이터 전체 수집 + 예측 계산
    if get_latest_draw_no() == 0:
        print("[startup] DB empty — seeding from XLSX...")
        count = await fetcher.fetch_all()
        if count > 0:
            analyzer.compute_and_save_all()
        print(f"[startup] seeded {count} draws")

    yield


app = FastAPI(title="Lotto Oracle", lifespan=lifespan)

INGESTOR_URL = os.getenv("INGESTOR_URL")


async def _track(event_type: str, metadata: dict):
    if not INGESTOR_URL:
        return
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            await client.post(
                f"{INGESTOR_URL}/v1/events",
                json={"event_type": event_type, "service_id": "lotto-oracle", "metadata": metadata},
            )
    except Exception:
        pass


# ---------------------------------------------------------------------------
# GET /api/algorithms
# ---------------------------------------------------------------------------
@app.get("/api/algorithms")
def get_algorithms():
    return analyzer.list_algorithms()


# ---------------------------------------------------------------------------
# GET /api/stats
# ---------------------------------------------------------------------------
@app.get("/api/stats")
def get_stats():
    with get_conn() as conn:
        total = conn.execute("SELECT COUNT(*) as cnt FROM draws").fetchone()["cnt"]
    latest = get_latest_draw_no()
    return {"total": total, "latest_draw_no": latest}


# ---------------------------------------------------------------------------
# POST /api/fetch — 데이터 수집 + 알고리즘 배치 계산
#
# mode=all    : 1회차부터 전체 수집 → 예측 계산 저장
# mode=latest : 최신 1회차 추가 → 예측 계산 저장
# ---------------------------------------------------------------------------
@app.post("/api/fetch")
async def fetch_data(mode: str = "latest"):
    if mode == "all":
        count = await fetcher.fetch_all()
        if count > 0:
            analyzer.compute_and_save_all()
        return {"fetched": count, "mode": "all"}

    data = await fetcher.fetch_latest()
    fetched = 1 if data else 0
    if fetched:
        analyzer.compute_and_save_all()
    return {"fetched": fetched, "mode": "latest"}


# ---------------------------------------------------------------------------
# POST /api/generate — 번호 반환
#
# predictions 테이블에 저장된 결과를 조회 (실시간 계산 없음).
# 아직 저장된 결과가 없으면(첫 실행 등) 실시간 계산으로 폴백.
# ---------------------------------------------------------------------------
class GenerateRequest(BaseModel):
    methods: list[str]
    count_per_method: int = 1

    @field_validator("methods")
    @classmethod
    def validate_methods(cls, v):
        if not v:
            raise ValueError("methods must not be empty")
        if len(v) > 3:
            raise ValueError("max 3 methods allowed")
        known = set(analyzer.ALGORITHM_REGISTRY.keys())
        for m in v:
            if m not in known:
                raise ValueError(f"unknown method: {m}")
        return v


@app.post("/api/generate")
async def generate_numbers(req: GenerateRequest):
    # 1. predictions 테이블에서 조회
    stored = get_predictions(req.methods)

    # 저장된 결과가 모든 요청 알고리즘을 커버하면 그대로 반환
    stored_methods = {r["method"] for r in stored}
    if stored_methods >= set(req.methods):
        # 요청한 methods 순서대로 정렬해서 반환
        ordered = [next(r for r in stored if r["method"] == m) for m in req.methods]
        asyncio.create_task(_track("api_call", {"endpoint": "/api/generate", "methods": req.methods}))
        return ordered

    # 2. 저장된 결과가 없으면(최초 실행 등) 실시간 계산 후 저장
    results = analyzer.generate(req.methods, req.count_per_method)
    latest  = get_latest_draw_no()
    from src.database import save_prediction
    for r in results:
        save_prediction(latest, r["method"], r["numbers"], r["score"])
    asyncio.create_task(_track("api_call", {"endpoint": "/api/generate", "methods": req.methods}))
    return results


# ---------------------------------------------------------------------------
# Static files + SPA fallback
# ---------------------------------------------------------------------------
app.mount("/static", StaticFiles(directory="public"), name="static")

@app.get("/")
def index():
    return FileResponse("public/preview-3d.html")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "src.main:app",
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", 8000)),
        reload=False,
    )
