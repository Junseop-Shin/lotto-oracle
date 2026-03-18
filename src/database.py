import sqlite3
import json
from pathlib import Path

DB_PATH = Path("db/lotto.db")

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS draws (
    draw_no     INTEGER PRIMARY KEY,
    draw_date   TEXT NOT NULL,
    n1 INTEGER, n2 INTEGER, n3 INTEGER,
    n4 INTEGER, n5 INTEGER, n6 INTEGER,
    bonus       INTEGER,
    prize_1st   INTEGER,
    winners_1st INTEGER,
    created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS analysis_cache (
    key         TEXT PRIMARY KEY,
    data        TEXT NOT NULL,
    based_on    INTEGER NOT NULL,
    updated_at  TEXT DEFAULT (datetime('now'))
);

-- 알고리즘별 회차별 예측 결과 히스토리
-- draw_no: 이 예측이 계산된 기준 회차 (해당 회차까지의 데이터로 다음 회차를 예측)
-- random은 매번 다르지만 일관성을 위해 동일하게 저장
CREATE TABLE IF NOT EXISTS predictions (
    draw_no     INTEGER NOT NULL,  -- 예측 기준 회차 (데이터 기반 최신 회차)
    method      TEXT NOT NULL,
    numbers     TEXT NOT NULL,     -- JSON: [n1, n2, n3, n4, n5, n6]
    score       REAL,
    created_at  TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (draw_no, method)  -- 회차+알고리즘 조합으로 중복 방지
);

"""

def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    DB_PATH.parent.mkdir(exist_ok=True)
    with get_conn() as conn:
        conn.executescript(SCHEMA_SQL)

def get_latest_draw_no() -> int:
    with get_conn() as conn:
        row = conn.execute("SELECT MAX(draw_no) as max_no FROM draws").fetchone()
        return row["max_no"] or 0

def get_cache(key: str) -> dict | None:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM analysis_cache WHERE key = ?", (key,)).fetchone()
        if row:
            return {"key": row["key"], "data": json.loads(row["data"]), "based_on": row["based_on"], "updated_at": row["updated_at"]}
        return None

def set_cache(key: str, data: dict, based_on: int):
    with get_conn() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO analysis_cache (key, data, based_on, updated_at) VALUES (?, ?, ?, datetime('now'))",
            (key, json.dumps(data), based_on)
        )

# ── predictions 테이블 헬퍼 ─────────────────────────────────────────────

def save_prediction(draw_no: int, method: str, numbers: list, score: float):
    """알고리즘 예측 결과를 draw_no 기준으로 저장.

    같은 (draw_no, method) 쌍은 무시 — 멱등성 보장.
    결정론적 알고리즘은 같은 draw_no면 항상 같은 결과이므로 IGNORE가 안전.
    """
    with get_conn() as conn:
        conn.execute(
            """INSERT OR IGNORE INTO predictions (draw_no, method, numbers, score)
               VALUES (?, ?, ?, ?)""",
            (draw_no, method, json.dumps(numbers), score)
        )

def get_predictions(methods: list[str]) -> list[dict]:
    """지정 알고리즘들의 최신 회차 기준 예측 결과 조회.

    draw_no가 가장 큰(최신) 회차의 결과만 반환.
    """
    if not methods:
        return []
    placeholders = ",".join("?" * len(methods))
    with get_conn() as conn:
        # 최신 draw_no 기준으로 각 method의 결과 조회
        rows = conn.execute(
            f"""SELECT method, numbers, score, draw_no
                FROM predictions
                WHERE method IN ({placeholders})
                  AND draw_no = (SELECT MAX(draw_no) FROM predictions WHERE method = predictions.method)""",
            methods
        ).fetchall()
    return [
        {
            "method":  row["method"],
            "numbers": json.loads(row["numbers"]),
            "score":   row["score"],
            "draw_no": row["draw_no"],
        }
        for row in rows
    ]
