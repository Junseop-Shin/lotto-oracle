"""
Analyzer module — lotto number generation engines.

Adding a new algorithm:
  1. Define a function:  generate_xxx(draws: list[list[int]], count: int) -> list[dict]
  2. Register it in ALGORITHM_REGISTRY at the bottom.
"""

import numpy as np
from itertools import combinations
from src.database import get_conn, get_latest_draw_no, get_cache, set_cache


def get_all_draws() -> list[list[int]]:
    with get_conn() as conn:
        rows = conn.execute("SELECT n1,n2,n3,n4,n5,n6 FROM draws ORDER BY draw_no").fetchall()
        return [[row[i] for i in range(6)] for row in rows]


def get_frequency(last_n: int = 100) -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT n1,n2,n3,n4,n5,n6 FROM draws ORDER BY draw_no DESC LIMIT ?", (last_n,)
        ).fetchall()
    freq = {n: 0 for n in range(1, 46)}
    for row in rows:
        for i in range(6):
            freq[row[i]] += 1
    return [{"number": n, "count": freq[n]} for n in range(1, 46)]


def _build_cooccurrence(draws):
    matrix = np.zeros((46, 46), dtype=int)
    for draw in draws:
        for a, b in combinations(draw, 2):
            matrix[a][b] += 1
            matrix[b][a] += 1
    return matrix


def _build_conditional(cooc, draws):
    freq = np.zeros(46, dtype=int)
    for draw in draws:
        for n in draw:
            freq[n] += 1
    prob = np.zeros((46, 46), dtype=float)
    for a in range(1, 46):
        if freq[a] > 0:
            for b in range(1, 46):
                if a != b:
                    prob[a][b] = cooc[a][b] / freq[a]
    return prob


def _build_markov(draws):
    transition = np.zeros((46, 46), dtype=int)
    freq = np.zeros(46, dtype=int)
    for i in range(len(draws) - 1):
        for a in draws[i]:
            freq[a] += 1
            for b in draws[i + 1]:
                transition[a][b] += 1
    prob = np.zeros((46, 46), dtype=float)
    for a in range(1, 46):
        if freq[a] > 0:
            prob[a] = transition[a] / freq[a]
    return prob


def ensure_cache():
    latest = get_latest_draw_no()
    draws = get_all_draws()

    def load_or_build(key, builder, *args):
        cached = get_cache(key)
        if cached and cached["based_on"] == latest:
            return np.array(cached["data"])
        result = builder(*args)
        set_cache(key, result.tolist(), latest)
        return result

    cooc = load_or_build("cooccurrence", _build_cooccurrence, draws)
    cond = load_or_build("conditional", _build_conditional, cooc, draws)
    markov = load_or_build("markov", _build_markov, draws)
    return cooc, cond, markov


def rebuild_all_caches():
    draws = get_all_draws()
    latest = get_latest_draw_no()
    cooc = _build_cooccurrence(draws)
    cond = _build_conditional(cooc, draws)
    markov = _build_markov(draws)
    set_cache("cooccurrence", cooc.tolist(), latest)
    set_cache("conditional", cond.tolist(), latest)
    set_cache("markov", markov.tolist(), latest)


def generate_apriori(draws, count):
    cooc, _, _ = ensure_cache()
    total = max(cooc[1:, 1:].sum() / 2, 1)
    freq = np.array([cooc[i].sum() / 2 for i in range(46)], dtype=float)
    results = []
    for _ in range(count):
        best_lift, seed_a, seed_b = -1, 7, 14
        for a in range(1, 46):
            for b in range(a + 1, 46):
                if freq[a] > 0 and freq[b] > 0:
                    lift = (cooc[a][b] / total) / ((freq[a] / total) * (freq[b] / total))
                    if lift > best_lift:
                        best_lift, seed_a, seed_b = lift, a, b
        numbers = [seed_a, seed_b]
        while len(numbers) < 6:
            best_score, best_n = -1, -1
            for n in range(1, 46):
                if n in numbers:
                    continue
                score = sum(cooc[n][x] for x in numbers)
                if score > best_score:
                    best_score, best_n = score, n
            numbers.append(best_n)
        score = float(sum(cooc[a][b] for a, b in combinations(numbers, 2)))
        results.append({"numbers": sorted(numbers), "score": score, "method": "apriori"})
    return results


def generate_conditional(draws, count):
    _, cond, _ = ensure_cache()
    freq = np.zeros(46, dtype=int)
    for draw in draws:
        for n in draw:
            freq[n] += 1
    results = []
    for _ in range(count):
        anchor = int(np.argmax(freq[1:])) + 1
        numbers = [anchor]
        while len(numbers) < 6:
            scores = np.zeros(46)
            for x in numbers:
                scores += cond[x]
            scores[0] = -1
            for x in numbers:
                scores[x] = -1
            numbers.append(int(np.argmax(scores)))
        score = float(np.mean([cond[a][b] for a, b in combinations(numbers, 2)]))
        results.append({"numbers": sorted(numbers), "score": score, "method": "conditional"})
    return results


def generate_markov(draws, count):
    _, _, markov = ensure_cache()
    latest_draw = draws[-1] if draws else list(range(1, 7))
    results = []
    for _ in range(count):
        scores = np.zeros(46)
        for n in latest_draw:
            scores += markov[n]
        for n in latest_draw:
            scores[n] *= 0.5
        scores[0] = -1
        top = np.argsort(scores)[::-1][:6]
        numbers = sorted([int(x) for x in top])
        score = float(np.mean([scores[n] for n in numbers]))
        results.append({"numbers": numbers, "score": score, "method": "markov"})
    return results


# ---------------------------------------------------------------------------
# Algorithm Registry
# To add a new algorithm:
#   1. Implement generate_xxx(draws, count) -> list[dict]
#   2. Add an entry below
# ---------------------------------------------------------------------------

ALGORITHM_REGISTRY: dict = {
    "apriori": {
        "label": "Apriori",
        "description": "공동출현 빈도 기반 연관규칙",
        "fn": generate_apriori,
    },
    "conditional": {
        "label": "조건부확률",
        "description": "P(B|A) 조건부 확률 기반",
        "fn": generate_conditional,
    },
    "markov": {
        "label": "마르코프",
        "description": "전 회차 → 다음 회차 전이확률",
        "fn": generate_markov,
    },
}


def list_algorithms() -> list[dict]:
    return [{"id": k, "label": v["label"], "description": v["description"]}
            for k, v in ALGORITHM_REGISTRY.items()]


def generate(methods: list[str], count_per_method: int = 1) -> list[dict]:
    draws = get_all_draws()
    results = []
    for method in methods:
        algo = ALGORITHM_REGISTRY.get(method)
        if algo:
            results.extend(algo["fn"](draws, count_per_method))
    return results
