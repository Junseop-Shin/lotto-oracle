"""
FastAPI endpoint tests.
Run: PYTHONPATH=. pytest tests/test_api.py -v
"""
import pytest
from unittest.mock import patch, AsyncMock
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def client(tmp_path, monkeypatch):
    """TestClient with isolated temp DB and scheduler disabled."""
    import src.database as db_module
    import src.main as main_module

    monkeypatch.setattr(db_module, "DB_PATH", tmp_path / "test.db")
    monkeypatch.setattr(main_module, "setup_scheduler", lambda: None)

    from src.main import app
    with TestClient(app) as c:
        yield c


@pytest.fixture
def client_with_data(tmp_path, monkeypatch):
    """TestClient with 10 sample draws pre-loaded."""
    import src.database as db_module
    import src.main as main_module

    monkeypatch.setattr(db_module, "DB_PATH", tmp_path / "test.db")
    monkeypatch.setattr(main_module, "setup_scheduler", lambda: None)

    from src.database import init_db, get_conn
    init_db()
    sample = [
        (1,  '2002-12-07', 10, 23, 29, 33, 37, 40, 16, 1000000000, 5),
        (2,  '2002-12-14',  9, 13, 21, 25, 32, 42,  2,  900000000, 4),
        (3,  '2002-12-21', 11, 16, 19, 20, 27, 31, 37, 1100000000, 7),
        (4,  '2002-12-28', 14, 15, 26, 28, 39, 45,  3,  950000000, 6),
        (5,  '2003-01-04',  7, 18, 22, 30, 35, 44, 12, 1050000000, 5),
        (6,  '2003-01-11',  3, 11, 24, 33, 38, 41,  9,  850000000, 4),
        (7,  '2003-01-18',  6, 17, 20, 29, 36, 43, 15, 1150000000, 8),
        (8,  '2003-01-25',  2, 12, 25, 31, 40, 45,  7,  980000000, 5),
        (9,  '2003-02-01',  4, 16, 23, 28, 37, 42, 11, 1020000000, 6),
        (10, '2003-02-08',  8, 19, 26, 32, 39, 44,  1, 1080000000, 7),
    ]
    with get_conn() as conn:
        conn.executemany(
            "INSERT OR IGNORE INTO draws (draw_no,draw_date,n1,n2,n3,n4,n5,n6,bonus,prize_1st,winners_1st) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            sample,
        )

    from src.main import app
    with TestClient(app) as c:
        yield c


# ---------------------------------------------------------------------------
# GET /api/stats
# ---------------------------------------------------------------------------

def test_stats_empty_db(client):
    r = client.get("/api/stats")
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 0
    assert body["latest_draw_no"] == 0


def test_stats_with_data(client_with_data):
    r = client_with_data.get("/api/stats")
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 10
    assert body["latest_draw_no"] == 10


# ---------------------------------------------------------------------------
# GET /api/algorithms
# ---------------------------------------------------------------------------

def test_algorithms_returns_list(client):
    r = client.get("/api/algorithms")
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, list)
    assert len(body) > 0


def test_algorithms_have_required_fields(client):
    r = client.get("/api/algorithms")
    for algo in r.json():
        assert "id" in algo
        assert "label" in algo
        assert "description" in algo


def test_algorithms_includes_all_five(client):
    r = client.get("/api/algorithms")
    ids = {a["id"] for a in r.json()}
    assert ids == {"apriori", "conditional", "markov", "ensemble", "random"}


# ---------------------------------------------------------------------------
# POST /api/generate
# ---------------------------------------------------------------------------

def test_generate_valid_request(client_with_data):
    r = client_with_data.post("/api/generate", json={"methods": ["apriori"]})
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    row = body[0]
    assert row["method"] == "apriori"
    assert len(row["numbers"]) == 6
    assert all(1 <= n <= 45 for n in row["numbers"])


def test_generate_multiple_methods(client_with_data):
    r = client_with_data.post("/api/generate", json={"methods": ["apriori", "markov", "random"]})
    assert r.status_code == 200
    body = r.json()
    methods = {row["method"] for row in body}
    assert methods == {"apriori", "markov", "random"}


def test_generate_unknown_method_rejected(client):
    r = client.post("/api/generate", json={"methods": ["unknown_algo"]})
    assert r.status_code == 422


def test_generate_too_many_methods_rejected(client):
    r = client.post("/api/generate", json={"methods": ["apriori", "markov", "random", "ensemble"]})
    assert r.status_code == 422


def test_generate_empty_methods_rejected(client):
    r = client.post("/api/generate", json={"methods": []})
    assert r.status_code == 422


# ---------------------------------------------------------------------------
# POST /api/fetch
# ---------------------------------------------------------------------------

def test_fetch_mode_latest_no_new(client_with_data, monkeypatch):
    monkeypatch.setattr("src.fetcher.fetch_latest", AsyncMock(return_value=None))
    r = client_with_data.post("/api/fetch?mode=latest")
    assert r.status_code == 200
    assert r.json() == {"fetched": 0, "mode": "latest"}


def test_fetch_mode_latest_with_new(client_with_data, monkeypatch):
    new_draw = {"drwNo": 11, "drwNoDate": "2003-02-15",
                "drwtNo1": 1, "drwtNo2": 5, "drwtNo3": 9,
                "drwtNo4": 20, "drwtNo5": 33, "drwtNo6": 44,
                "bnusNo": 17, "firstWinamnt": 999999999, "firstPrzwnerCo": 3}
    monkeypatch.setattr("src.fetcher.fetch_latest", AsyncMock(return_value=new_draw))
    r = client_with_data.post("/api/fetch?mode=latest")
    assert r.status_code == 200
    assert r.json() == {"fetched": 1, "mode": "latest"}


def test_fetch_mode_all(client, monkeypatch):
    monkeypatch.setattr("src.fetcher.fetch_all", AsyncMock(return_value=1215))
    r = client.post("/api/fetch?mode=all")
    assert r.status_code == 200
    assert r.json() == {"fetched": 1215, "mode": "all"}


# ---------------------------------------------------------------------------
# Static / SPA
# ---------------------------------------------------------------------------

def test_index_returns_html(client):
    r = client.get("/")
    assert r.status_code == 200
    assert "text/html" in r.headers["content-type"]
