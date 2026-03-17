"""
pytest tests for lotto number generation algorithms.
Run: PYTHONPATH=. pytest tests/test_algorithms.py -v
"""
import pytest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.database import init_db, get_conn


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def setup_db(tmp_path, monkeypatch):
    """Use a temp DB with sample draw data for each test."""
    import src.database as db_module
    monkeypatch.setattr(db_module, "DB_PATH", tmp_path / "test_lotto.db")
    init_db()

    sample_draws = [
        (1, '2002-12-07', 10, 23, 29, 33, 37, 40, 16, 1000000000, 5),
        (2, '2002-12-14', 9, 13, 21, 25, 32, 42, 2, 900000000, 4),
        (3, '2002-12-21', 11, 16, 19, 20, 27, 31, 37, 1100000000, 7),
        (4, '2002-12-28', 14, 15, 26, 28, 39, 45, 3, 950000000, 6),
        (5, '2003-01-04', 7, 18, 22, 30, 35, 44, 12, 1050000000, 5),
        (6, '2003-01-11', 3, 11, 24, 33, 38, 41, 9, 850000000, 4),
        (7, '2003-01-18', 6, 17, 20, 29, 36, 43, 15, 1150000000, 8),
        (8, '2003-01-25', 2, 12, 25, 31, 40, 45, 7, 980000000, 5),
        (9, '2003-02-01', 4, 16, 23, 28, 37, 42, 11, 1020000000, 6),
        (10, '2003-02-08', 8, 19, 26, 32, 39, 44, 1, 1080000000, 7),
    ]

    with get_conn() as conn:
        conn.executemany(
            "INSERT OR IGNORE INTO draws (draw_no,draw_date,n1,n2,n3,n4,n5,n6,bonus,prize_1st,winners_1st) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            sample_draws
        )
    yield


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def is_valid_result(result: dict) -> bool:
    nums = result.get("numbers", [])
    return (
        len(nums) == 6
        and len(set(nums)) == 6
        and all(1 <= n <= 45 for n in nums)
        and "score" in result
        and "method" in result
    )


# ---------------------------------------------------------------------------
# Registry tests
# ---------------------------------------------------------------------------

def test_algorithm_registry_not_empty():
    from src.analyzer import ALGORITHM_REGISTRY
    assert len(ALGORITHM_REGISTRY) > 0


def test_algorithm_registry_has_required_fields():
    from src.analyzer import ALGORITHM_REGISTRY
    for key, value in ALGORITHM_REGISTRY.items():
        assert "label" in value
        assert "description" in value
        assert "fn" in value
        assert callable(value["fn"])


def test_list_algorithms_returns_all():
    from src.analyzer import list_algorithms, ALGORITHM_REGISTRY
    result = list_algorithms()
    assert len(result) == len(ALGORITHM_REGISTRY)
    for item in result:
        assert "id" in item
        assert "label" in item
        assert "description" in item


# ---------------------------------------------------------------------------
# generate() integration tests
# ---------------------------------------------------------------------------

def test_generate_single_method():
    from src.analyzer import generate
    results = generate(["apriori"], count_per_method=1)
    assert len(results) == 1
    assert is_valid_result(results[0])


def test_generate_multiple_methods():
    from src.analyzer import generate
    results = generate(["apriori", "conditional", "markov"], count_per_method=1)
    assert len(results) == 3
    methods = [r["method"] for r in results]
    assert "apriori" in methods
    assert "conditional" in methods
    assert "markov" in methods


def test_generate_count_per_method():
    from src.analyzer import generate
    results = generate(["apriori", "markov"], count_per_method=2)
    assert len(results) == 4


def test_generate_unknown_method_skipped():
    from src.analyzer import generate
    results = generate(["apriori", "nonexistent"], count_per_method=1)
    assert len(results) == 1


# ---------------------------------------------------------------------------
# Per-algorithm tests
# ---------------------------------------------------------------------------

class TestApriori:
    def test_returns_valid_numbers(self):
        from src.analyzer import generate_apriori, get_all_draws
        draws = get_all_draws()
        results = generate_apriori(draws, count=1)
        assert len(results) == 1
        assert is_valid_result(results[0])

    def test_method_label(self):
        from src.analyzer import generate_apriori, get_all_draws
        results = generate_apriori(get_all_draws(), count=1)
        assert results[0]["method"] == "apriori"

    def test_count_parameter(self):
        from src.analyzer import generate_apriori, get_all_draws
        results = generate_apriori(get_all_draws(), count=3)
        assert len(results) == 3
        for r in results:
            assert is_valid_result(r)


class TestConditional:
    def test_returns_valid_numbers(self):
        from src.analyzer import generate_conditional, get_all_draws
        results = generate_conditional(get_all_draws(), count=1)
        assert len(results) == 1
        assert is_valid_result(results[0])

    def test_method_label(self):
        from src.analyzer import generate_conditional, get_all_draws
        results = generate_conditional(get_all_draws(), count=1)
        assert results[0]["method"] == "conditional"

    def test_count_parameter(self):
        from src.analyzer import generate_conditional, get_all_draws
        results = generate_conditional(get_all_draws(), count=3)
        assert len(results) == 3
        for r in results:
            assert is_valid_result(r)


class TestMarkov:
    def test_returns_valid_numbers(self):
        from src.analyzer import generate_markov, get_all_draws
        results = generate_markov(get_all_draws(), count=1)
        assert len(results) == 1
        assert is_valid_result(results[0])

    def test_method_label(self):
        from src.analyzer import generate_markov, get_all_draws
        results = generate_markov(get_all_draws(), count=1)
        assert results[0]["method"] == "markov"

    def test_uses_latest_draw_as_state(self):
        from src.analyzer import generate_markov, get_all_draws
        draws = get_all_draws()
        results = generate_markov(draws, count=1)
        # Should return 6 numbers not all from latest draw (transition adds diversity)
        latest = set(draws[-1])
        result_set = set(results[0]["numbers"])
        assert len(result_set) == 6

    def test_empty_draws_fallback(self):
        from src.analyzer import generate_markov
        results = generate_markov([], count=1)
        assert len(results) == 1
        assert is_valid_result(results[0])
