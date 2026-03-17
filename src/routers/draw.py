from fastapi import APIRouter, BackgroundTasks
from src.database import get_conn, get_latest_draw_no
from src import fetcher

router = APIRouter(prefix="/api/draws", tags=["draws"])

@router.get("/stats")
def get_stats():
    with get_conn() as conn:
        total = conn.execute("SELECT COUNT(*) as cnt FROM draws").fetchone()["cnt"]
        latest = get_latest_draw_no()
    return {"total": total, "latest_draw_no": latest}

@router.get("/latest")
def get_latest():
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM draws ORDER BY draw_no DESC LIMIT 1").fetchone()
        if not row:
            return {}
        return dict(row)

@router.get("/{draw_no}")
def get_draw(draw_no: int):
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM draws WHERE draw_no = ?", (draw_no,)).fetchone()
        if not row:
            return {"error": "not found"}
        return dict(row)

@router.get("")
def list_draws(page: int = 1, size: int = 20):
    offset = (page - 1) * size
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM draws ORDER BY draw_no DESC LIMIT ? OFFSET ?", (size, offset)).fetchall()
        return [dict(row) for row in rows]

@router.post("/fetch")
async def trigger_fetch(mode: str = "latest"):
    if mode == "all":
        count = await fetcher.fetch_all()
        return {"fetched": count, "mode": "all"}
    else:
        data = await fetcher.fetch_latest()
        return {"fetched": 1 if data else 0, "mode": "latest", "draw": data}
