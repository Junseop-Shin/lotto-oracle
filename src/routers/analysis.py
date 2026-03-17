from fastapi import APIRouter
from pydantic import BaseModel
from src import analyzer
from src.database import get_conn, get_cache

router = APIRouter(prefix="/api/analysis", tags=["analysis"])

class GenerateRequest(BaseModel):
    method: str = "combined"
    weights: dict = {"apriori": 0.4, "conditional": 0.35, "markov": 0.25}
    count: int = 5

@router.post("/generate")
def generate(req: GenerateRequest):
    cooc, cond, markov, latest = analyzer.ensure_cache()
    draws = analyzer.get_all_draws()

    if req.method == "apriori":
        return analyzer.generate_apriori(cooc, req.count)
    elif req.method == "conditional":
        return analyzer.generate_conditional(cond, draws, req.count)
    elif req.method == "markov":
        return analyzer.generate_markov(markov, draws, req.count)
    else:
        return analyzer.generate_combined(cooc, cond, markov, draws, req.count, req.weights)

@router.get("/frequency")
def get_frequency(last_n: int = 100):
    return analyzer.get_frequency(last_n)

@router.get("/cooccurrence")
def get_cooccurrence(top_n: int = 20):
    cooc, _, _, _ = analyzer.ensure_cache()
    pairs = []
    for a in range(1, 46):
        for b in range(a + 1, 46):
            pairs.append({"a": a, "b": b, "count": int(cooc[a][b])})
    pairs.sort(key=lambda x: x["count"], reverse=True)
    return pairs[:top_n]

@router.get("/markov/latest")
def get_markov_latest():
    _, _, markov, _ = analyzer.ensure_cache()
    draws = analyzer.get_all_draws()
    latest = draws[-1] if draws else []
    result = {}
    for n in latest:
        top = sorted(range(1, 46), key=lambda x: markov[n][x], reverse=True)[:10]
        result[str(n)] = [{"number": x, "prob": round(float(markov[n][x]), 4)} for x in top]
    return {"latest_draw": latest, "transitions": result}

@router.get("/cache/status")
def cache_status():
    from src.database import get_latest_draw_no
    latest = get_latest_draw_no()
    statuses = {}
    for key in ["cooccurrence", "conditional", "markov"]:
        cache = get_cache(key)
        statuses[key] = {
            "exists": cache is not None,
            "based_on": cache["based_on"] if cache else None,
            "up_to_date": cache["based_on"] == latest if cache else False,
            "updated_at": cache["updated_at"] if cache else None,
        }
    return {"latest_draw_no": latest, "caches": statuses}

@router.post("/cache/rebuild")
def rebuild_cache():
    latest = analyzer.rebuild_all_caches()
    return {"status": "ok", "based_on": latest}
