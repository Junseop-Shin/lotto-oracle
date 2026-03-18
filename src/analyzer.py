"""
Analyzer module — lotto number generation engines.

알고리즘 추가 방법:
  1. generate_xxx(draws, count) -> list[dict] 구현
  2. ALGORITHM_REGISTRY 에 등록

예측 결과 저장 흐름:
  fetch(all|latest) 완료 → compute_and_save_all() 호출
  → 모든 알고리즘 실행 → predictions 테이블에 1행씩 저장
  /api/generate 는 predictions 테이블 조회만 (실시간 계산 없음)
"""

import random as _random
import numpy as np
from itertools import combinations
from src.database import (
    get_conn, get_latest_draw_no,
    get_cache, set_cache,
    save_prediction,
)


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


# ── 행렬 빌더 ──────────────────────────────────────────────────────────────

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


# ── 캐시 관리 ─────────────────────────────────────────────────────────────

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

    cooc   = load_or_build("cooccurrence", _build_cooccurrence, draws)
    cond   = load_or_build("conditional",  _build_conditional,  cooc, draws)
    markov = load_or_build("markov",       _build_markov,       draws)
    return cooc, cond, markov


def rebuild_all_caches():
    draws  = get_all_draws()
    latest = get_latest_draw_no()
    cooc   = _build_cooccurrence(draws)
    cond   = _build_conditional(cooc, draws)
    markov = _build_markov(draws)
    set_cache("cooccurrence", cooc.tolist(),   latest)
    set_cache("conditional",  cond.tolist(),   latest)
    set_cache("markov",       markov.tolist(), latest)
    return cooc, cond, markov


# ── 알고리즘 구현 ──────────────────────────────────────────────────────────

def generate_apriori(draws, count):
    """공동출현 빈도 기반 Lift 점수로 연관 번호 쌍 선택."""
    cooc, _, _ = ensure_cache()
    total = max(cooc[1:, 1:].sum() / 2, 1)
    freq  = np.array([cooc[i].sum() / 2 for i in range(46)], dtype=float)
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
    """P(B|A) 조건부 확률 기반 번호 선택."""
    _, cond, _ = ensure_cache()
    freq = np.zeros(46, dtype=int)
    for draw in draws:
        for n in draw:
            freq[n] += 1
    results = []
    for _ in range(count):
        anchor  = int(np.argmax(freq[1:])) + 1
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
    """전 회차 → 다음 회차 전이확률 기반 번호 선택."""
    _, _, markov = ensure_cache()
    latest_draw = draws[-1] if draws else list(range(1, 7))
    results = []
    for _ in range(count):
        scores = np.zeros(46)
        for n in latest_draw:
            scores += markov[n]
        for n in latest_draw:
            scores[n] *= 0.5  # 이전 회차 번호는 반감 (연속 출현 가능성 낮음)
        scores[0] = -1
        top     = np.argsort(scores)[::-1][:6]
        numbers = sorted([int(x) for x in top])
        score   = float(np.mean([scores[n] for n in numbers]))
        results.append({"numbers": numbers, "score": score, "method": "markov"})
    return results


def generate_random(draws, count):
    """단순 랜덤: 1~45 중 6개를 무작위 추출."""
    results = []
    for _ in range(count):
        numbers = sorted(_random.sample(range(1, 46), 6))
        results.append({"numbers": numbers, "score": 0.0, "method": "random"})
    return results


def generate_ensemble(draws, count):
    """앙상블 투표: 3개 알고리즘 결과를 합산해 가장 많이 선택된 6개를 반환.

    각 알고리즘이 고른 번호에 1표씩 부여 → 득표 많은 순으로 6개 선택.
    동점 시 전체 역대 출현 빈도(freq)로 우선순위 결정.
    """
    # apriori, conditional, markov 세 알고리즘의 결과 수집
    pool_methods = ["apriori", "conditional", "markov"]
    candidates: list[dict] = []
    for method in pool_methods:
        algo = ALGORITHM_REGISTRY.get(method)
        if algo:
            candidates.extend(algo["fn"](draws, 1))

    # 번호별 득표 집계
    votes: dict[int, int] = {}
    for result in candidates:
        for n in result["numbers"]:
            votes[n] = votes.get(n, 0) + 1

    # 동점 해소용 전체 출현 빈도
    freq: dict[int, int] = {}
    for draw in draws:
        for n in draw:
            freq[n] = freq.get(n, 0) + 1

    ranked = sorted(
        range(1, 46),
        key=lambda n: (votes.get(n, 0), freq.get(n, 0)),
        reverse=True,
    )

    results = []
    for _ in range(count):
        numbers = sorted(ranked[:6])
        score   = float(sum(votes.get(n, 0) for n in numbers) / len(numbers))
        results.append({"numbers": numbers, "score": score, "method": "ensemble"})
    return results


# ── 알고리즘 레지스트리 ────────────────────────────────────────────────────

ALGORITHM_REGISTRY: dict = {
    "apriori": {
        "label":       "Apriori",
        "description": "공동출현 빈도 기반 연관규칙",
        "fn":          generate_apriori,
    },
    "conditional": {
        "label":       "조건부확률",
        "description": "P(B|A) 조건부 확률 기반",
        "fn":          generate_conditional,
    },
    "markov": {
        "label":       "마르코프",
        "description": "전 회차 → 다음 회차 전이확률",
        "fn":          generate_markov,
    },
    "ensemble": {
        "label":       "앙상블",
        "description": "3개 알고리즘 투표 결합",
        "fn":          generate_ensemble,
    },
    "random": {
        "label":       "랜덤",
        "description": "단순 무작위 추출",
        "fn":          generate_random,
    },
}


def list_algorithms() -> list[dict]:
    return [{"id": k, "label": v["label"], "description": v["description"]}
            for k, v in ALGORITHM_REGISTRY.items()]


def generate(methods: list[str], count_per_method: int = 1) -> list[dict]:
    """실시간 계산 (폴백 전용). 정상 경로는 predictions 테이블 조회."""
    draws   = get_all_draws()
    results = []
    for method in methods:
        algo = ALGORITHM_REGISTRY.get(method)
        if algo:
            results.extend(algo["fn"](draws, count_per_method))
    return results


def compute_and_save_all():
    """모든 알고리즘 실행 → predictions 테이블에 저장.

    fetch(all|latest) 완료 후, 그리고 주간 스케줄러 job에서 호출.
    랜덤은 배치 저장 불필요(매번 달라야 의미 있음)하지만 일관성을 위해 포함.
    """
    draws  = get_all_draws()
    latest = get_latest_draw_no()

    if not draws:
        return

    # 행렬 캐시를 먼저 최신화 (이후 알고리즘들이 재사용)
    rebuild_all_caches()

    for method, algo in ALGORITHM_REGISTRY.items():
        try:
            results = algo["fn"](draws, 1)
            if results:
                r = results[0]
                save_prediction(latest, method, r["numbers"], r["score"])
        except Exception as e:
            # 한 알고리즘 실패가 전체를 막지 않도록
            print(f"[analyzer] {method} 계산 실패: {e}")
