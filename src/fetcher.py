import asyncio
import io
import json
from datetime import date, timedelta

import httpx
from playwright.async_api import async_playwright

from src.database import get_conn, get_latest_draw_no

# superkts.com — 전체 회차 XLSX (no-auth, always up-to-date)
SEED_URL = "https://superkts.com/lotto/download_excel.php"
DHLOTTERY_MAIN = "https://www.dhlottery.co.kr/"

# 1회차 날짜 (2002-12-07, 토요일). 이후 매주 토요일 진행.
_DRAW_1_DATE = date(2002, 12, 7)


def _draw_date(draw_no: int) -> str:
    return (_DRAW_1_DATE + timedelta(weeks=draw_no - 1)).strftime("%Y-%m-%d")


def save_draw(data: dict):
    with get_conn() as conn:
        conn.execute(
            """INSERT OR IGNORE INTO draws
               (draw_no, draw_date, n1, n2, n3, n4, n5, n6, bonus, prize_1st, winners_1st)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                data["drwNo"], data["drwNoDate"],
                data["drwtNo1"], data["drwtNo2"], data["drwtNo3"],
                data["drwtNo4"], data["drwtNo5"], data["drwtNo6"],
                data["bnusNo"], data["firstWinamnt"], data["firstPrzwnerCo"],
            ),
        )


# ── fetch_all — 시드 XLSX 다운로드 후 전체 임포트 ────────────────────────────

async def fetch_all() -> int:
    """superkts.com에서 전체 회차 XLSX를 받아 DB에 임포트.

    - INSERT OR IGNORE 로 중복 안전 처리
    - draw_date는 1회차(2002-12-07) 기준 7일 간격으로 계산
    - 반환값: 새로 추가된 회차 수
    """
    import pandas as pd

    async with httpx.AsyncClient(follow_redirects=True, timeout=30) as client:
        r = await client.get(
            SEED_URL,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"},
        )
        if r.status_code != 200:
            print(f"[fetcher] 시드 다운로드 실패: HTTP {r.status_code}")
            return 0

    df = pd.read_excel(io.BytesIO(r.content))
    df.columns = [
        "draw_no", "n1", "n2", "n3", "n4", "n5", "n6",
        "bonus", "prize_1st", "winners_1st", "prize_2nd", "winners_2nd",
    ]

    rows = [
        (
            int(row.draw_no), _draw_date(int(row.draw_no)),
            int(row.n1), int(row.n2), int(row.n3),
            int(row.n4), int(row.n5), int(row.n6),
            int(row.bonus), int(row.prize_1st), int(row.winners_1st),
        )
        for row in df.itertuples(index=False)
    ]

    before = _count_draws()
    with get_conn() as conn:
        conn.executemany(
            """INSERT OR IGNORE INTO draws
               (draw_no, draw_date, n1, n2, n3, n4, n5, n6, bonus, prize_1st, winners_1st)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            rows,
        )
    return _count_draws() - before


def _count_draws() -> int:
    with get_conn() as conn:
        return conn.execute("SELECT COUNT(*) FROM draws").fetchone()[0]


# ── fetch_latest — Playwright로 메인 페이지에서 최신 회차 추출 ────────────────

async def fetch_latest() -> dict | None:
    """dhlottery 메인 페이지를 Playwright로 로드해 최신 회차 데이터를 추출.

    selectMainInfo.do XHR 응답 내 pstLtEpstInfo.lt645 배열 파싱.
    DB에 없는 회차만 저장하고, 가장 최신 회차 dict를 반환.
    """
    latest_in_db = get_latest_draw_no()
    new_draws: list[dict] = []

    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
                )
            )
            page = await context.new_page()

            async def handle_response(response):
                if "selectMainInfo.do" not in response.url:
                    return
                try:
                    body = await response.text()
                    data = json.loads(body)
                    lt645 = (
                        data.get("data", {})
                        .get("result", {})
                        .get("pstLtEpstInfo", {})
                        .get("lt645", [])
                    )
                    for draw in lt645:
                        draw_no = int(draw["ltEpsd"])
                        if draw_no <= latest_in_db:
                            continue
                        ymd = str(draw["ltRflYmd"])
                        new_draws.append({
                            "drwNo":        draw_no,
                            "drwNoDate":    f"{ymd[:4]}-{ymd[4:6]}-{ymd[6:]}",
                            "drwtNo1":      int(draw["tm1WnNo"]),
                            "drwtNo2":      int(draw["tm2WnNo"]),
                            "drwtNo3":      int(draw["tm3WnNo"]),
                            "drwtNo4":      int(draw["tm4WnNo"]),
                            "drwtNo5":      int(draw["tm5WnNo"]),
                            "drwtNo6":      int(draw["tm6WnNo"]),
                            "bnusNo":       int(draw["bnsWnNo"]),
                            "firstWinamnt": int(draw["rnk1WnAmt"]),
                            "firstPrzwnerCo": int(draw["rnk1WnNope"]),
                        })
                except Exception as e:
                    print(f"[fetcher] selectMainInfo 파싱 실패: {e}")

            page.on("response", handle_response)
            await page.goto(DHLOTTERY_MAIN, wait_until="networkidle", timeout=20000)
            await asyncio.sleep(2)
            await browser.close()

    except Exception as e:
        print(f"[fetcher] fetch_latest 실패: {e}")
        return None

    for draw_data in new_draws:
        save_draw(draw_data)

    return new_draws[0] if new_draws else None
