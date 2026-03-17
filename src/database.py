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

CREATE TABLE IF NOT EXISTS generated_history (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    numbers     TEXT NOT NULL,
    method      TEXT NOT NULL,
    score       REAL,
    created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS purchase_history (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    draw_no     INTEGER,
    numbers     TEXT NOT NULL,
    status      TEXT NOT NULL,
    receipt     TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
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
