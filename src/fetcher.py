import asyncio
import httpx
from src.database import get_conn, get_latest_draw_no

LOTTO_API_URL = "https://www.dhlottery.co.kr/common.do"

async def fetch_draw(client: httpx.AsyncClient, draw_no: int) -> dict | None:
    try:
        resp = await client.get(LOTTO_API_URL, params={"method": "getLottoNumber", "drwNo": draw_no}, timeout=10)
        data = resp.json()
        if data.get("returnValue") != "success":
            return None
        return data
    except Exception:
        return None

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
                data["bnusNo"], data["firstWinamnt"], data["firstPrzwnerCo"]
            )
        )

async def fetch_all() -> int:
    latest = get_latest_draw_no()
    current = latest + 1
    count = 0
    async with httpx.AsyncClient(follow_redirects=True) as client:
        while True:
            data = await fetch_draw(client, current)
            if not data:
                break
            save_draw(data)
            count += 1
            current += 1
            if count % 100 == 0:
                await asyncio.sleep(0.1)
            await asyncio.sleep(0.3)
    return count

async def fetch_latest() -> dict | None:
    latest = get_latest_draw_no()
    async with httpx.AsyncClient(follow_redirects=True) as client:
        data = await fetch_draw(client, latest + 1)
        if data:
            save_draw(data)
        return data
