from fastapi import APIRouter
from pydantic import BaseModel
from src.database import get_conn
import json

router = APIRouter(prefix="/api/purchase", tags=["purchase"])

class PurchaseRequest(BaseModel):
    numbers: list[list[int]]
    credentials: dict  # {id, pw} — not stored

class PreviewRequest(BaseModel):
    numbers: list[list[int]]

@router.post("/preview")
def preview(req: PreviewRequest):
    results = []
    for nums in req.numbers:
        valid = len(nums) == 6 and all(1 <= n <= 45 for n in nums) and len(set(nums)) == 6
        results.append({"numbers": sorted(nums), "valid": valid})
    return results

@router.post("/execute")
async def execute(req: PurchaseRequest):
    try:
        from src.buyer import purchase
        result = await purchase(req.numbers, req.credentials["id"], req.credentials["pw"])
        with get_conn() as conn:
            for nums in req.numbers:
                conn.execute(
                    "INSERT INTO purchase_history (numbers, status, receipt) VALUES (?, ?, ?)",
                    (json.dumps(nums), result["status"], result.get("receipt"))
                )
        return result
    except Exception as e:
        return {"status": "failed", "error": str(e)}

@router.get("/history")
def history():
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM purchase_history ORDER BY created_at DESC LIMIT 50").fetchall()
        return [dict(row) for row in rows]
