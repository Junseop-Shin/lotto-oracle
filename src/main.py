import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel, field_validator
from dotenv import load_dotenv

load_dotenv()

from src.database import init_db, get_conn, get_latest_draw_no
from src import fetcher, analyzer


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield

app = FastAPI(title="Lotto Oracle", lifespan=lifespan)


# ---------------------------------------------------------------------------
# GET /api/algorithms — available algorithms
# ---------------------------------------------------------------------------
@app.get("/api/algorithms")
def get_algorithms():
    return analyzer.list_algorithms()


# ---------------------------------------------------------------------------
# GET /api/stats — DB status
# ---------------------------------------------------------------------------
@app.get("/api/stats")
def get_stats():
    with get_conn() as conn:
        total = conn.execute("SELECT COUNT(*) as cnt FROM draws").fetchone()["cnt"]
    latest = get_latest_draw_no()
    return {"total": total, "latest_draw_no": latest}


# ---------------------------------------------------------------------------
# POST /api/fetch — manual data collection batch
# ---------------------------------------------------------------------------
@app.post("/api/fetch")
async def fetch_data(mode: str = "latest"):
    if mode == "all":
        count = await fetcher.fetch_all()
        return {"fetched": count, "mode": "all"}
    data = await fetcher.fetch_latest()
    return {"fetched": 1 if data else 0, "mode": "latest"}


# ---------------------------------------------------------------------------
# POST /api/generate — number generation
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
def generate_numbers(req: GenerateRequest):
    return analyzer.generate(req.methods, req.count_per_method)


# ---------------------------------------------------------------------------
# Static files + SPA fallback
# ---------------------------------------------------------------------------
app.mount("/static", StaticFiles(directory="public"), name="static")

@app.get("/")
def index():
    return FileResponse("public/index.html")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "src.main:app",
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", 8000)),
        reload=False,
    )
