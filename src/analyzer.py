import json
import numpy as np
from itertools import combinations
from src.database import get_conn, get_latest_draw_no, get_cache, set_cache

def get_all_draws() -> list[list[int]]:
    with get_conn() as conn:
        rows = conn.execute("SELECT n1,n2,n3,n4,n5,n6 FROM draws ORDER BY draw_no").fetchall()
        return [[row[i] for i in range(6)] for row in rows]

def build_cooccurrence(draws: list[list[int]]) -> np.ndarray:
    matrix = np.zeros((46, 46), dtype=int)
    for draw in draws:
        for a, b in combinations(draw, 2):
            matrix[a][b] += 1
            matrix[b][a] += 1
    return matrix

def build_conditional(matrix: np.ndarray, draws: list[list[int]]) -> np.ndarray:
    freq = np.zeros(46, dtype=int)
    for draw in draws:
        for n in draw:
            freq[n] += 1
    prob = np.zeros((46, 46), dtype=float)
    for a in range(1, 46):
        if freq[a] > 0:
            for b in range(1, 46):
                if a != b:
                    prob[a][b] = matrix[a][b] / freq[a]
    return prob

def build_markov(draws: list[list[int]]) -> np.ndarray:
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

def ensure_cache() -> tuple[np.ndarray, np.ndarray, np.ndarray, int]:
    latest = get_latest_draw_no()
    draws = get_all_draws()

    cooc_cache = get_cache("cooccurrence")
    cond_cache = get_cache("conditional")
    markov_cache = get_cache("markov")

    if cooc_cache and cooc_cache["based_on"] == latest:
        cooc = np.array(cooc_cache["data"])
    else:
        cooc = build_cooccurrence(draws)
        set_cache("cooccurrence", cooc.tolist(), latest)

    if cond_cache and cond_cache["based_on"] == latest:
        cond = np.array(cond_cache["data"])
    else:
        cond = build_conditional(cooc, draws)
        set_cache("conditional", cond.tolist(), latest)

    if markov_cache and markov_cache["based_on"] == latest:
        markov = np.array(markov_cache["data"])
    else:
        markov = build_markov(draws)
        set_cache("markov", markov.tolist(), latest)

    return cooc, cond, markov, latest

def generate_apriori(cooc: np.ndarray, count: int = 1) -> list[dict]:
    results = []
    total = cooc.sum() / 2
    freq = np.array([cooc[i].sum() / 2 for i in range(46)])

    for _ in range(count):
        numbers = []
        # seed: highest lift pair
        best_lift = -1
        seed_a, seed_b = 7, 14
        for a in range(1, 46):
            for b in range(a + 1, 46):
                if freq[a] > 0 and freq[b] > 0 and total > 0:
                    lift = (cooc[a][b] / total) / ((freq[a] / total) * (freq[b] / total))
                    if lift > best_lift:
                        best_lift = lift
                        seed_a, seed_b = a, b
        numbers = [seed_a, seed_b]
        while len(numbers) < 6:
            best_score = -1
            best_n = -1
            for n in range(1, 46):
                if n in numbers:
                    continue
                score = sum(cooc[n][x] for x in numbers)
                if score > best_score:
                    best_score = score
                    best_n = n
            numbers.append(best_n)
        score = sum(cooc[a][b] for a, b in combinations(numbers, 2))
        results.append({"numbers": sorted(numbers), "score": float(score), "method": "apriori"})
    return results

def generate_conditional(cond: np.ndarray, draws: list[list[int]], count: int = 1) -> list[dict]:
    results = []
    freq = np.zeros(46, dtype=int)
    for draw in draws:
        for n in draw:
            freq[n] += 1

    for _ in range(count):
        anchor = int(np.argmax(freq[1:])) + 1
        numbers = [anchor]
        while len(numbers) < 6:
            scores = np.zeros(46)
            for x in numbers:
                scores += cond[x]
            for x in numbers:
                scores[x] = -1
            scores[0] = -1
            best_n = int(np.argmax(scores))
            numbers.append(best_n)
        score = float(np.mean([cond[a][b] for a, b in combinations(numbers, 2)]))
        results.append({"numbers": sorted(numbers), "score": score, "method": "conditional"})
    return results

def generate_markov(markov: np.ndarray, draws: list[list[int]], count: int = 1) -> list[dict]:
    results = []
    latest_draw = draws[-1] if draws else list(range(1, 7))

    for _ in range(count):
        scores = np.zeros(46)
        for n in latest_draw:
            scores += markov[n]
        for n in latest_draw:
            scores[n] *= 0.5
        scores[0] = -1
        top_indices = np.argsort(scores)[::-1]
        numbers = [int(x) for x in top_indices[:6]]
        score = float(np.mean([scores[n] for n in numbers]))
        results.append({"numbers": sorted(numbers), "score": score, "method": "markov"})
    return results

def generate_combined(cooc, cond, markov, draws, count=1, weights=None) -> list[dict]:
    if weights is None:
        weights = {"apriori": 0.4, "conditional": 0.35, "markov": 0.25}

    results = []
    freq = np.zeros(46, dtype=int)
    for draw in draws:
        for n in draw:
            freq[n] += 1
    latest_draw = draws[-1] if draws else list(range(1, 7))

    for _ in range(count):
        apriori_scores = np.zeros(46)
        for n in range(1, 46):
            apriori_scores[n] = sum(cooc[n][x] for x in range(1, 46))

        cond_scores = np.zeros(46)
        for n in range(1, 46):
            cond_scores[n] = np.mean(cond[n][1:])

        markov_scores = np.zeros(46)
        for n in latest_draw:
            markov_scores += markov[n]

        def normalize(arr):
            mn, mx = arr[1:].min(), arr[1:].max()
            if mx == mn:
                return arr
            result = arr.copy()
            result[1:] = (arr[1:] - mn) / (mx - mn)
            return result

        combined = (
            weights["apriori"] * normalize(apriori_scores) +
            weights["conditional"] * normalize(cond_scores) +
            weights["markov"] * normalize(markov_scores)
        )
        combined[0] = -1
        top = np.argsort(combined)[::-1][:6]
        numbers = sorted([int(x) for x in top])
        score = float(np.mean([combined[n] for n in numbers]))
        results.append({"numbers": numbers, "score": score, "method": "combined"})
    return results

def get_frequency(last_n: int = 100) -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute(
            f"SELECT n1,n2,n3,n4,n5,n6 FROM draws ORDER BY draw_no DESC LIMIT {last_n}"
        ).fetchall()
    freq = {}
    for row in rows:
        for i in range(6):
            n = row[i]
            freq[n] = freq.get(n, 0) + 1
    return [{"number": n, "count": freq.get(n, 0)} for n in range(1, 46)]

def rebuild_all_caches():
    draws = get_all_draws()
    latest = get_latest_draw_no()
    cooc = build_cooccurrence(draws)
    cond = build_conditional(cooc, draws)
    markov = build_markov(draws)
    set_cache("cooccurrence", cooc.tolist(), latest)
    set_cache("conditional", cond.tolist(), latest)
    set_cache("markov", markov.tolist(), latest)
    return latest
