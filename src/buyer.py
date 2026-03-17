from playwright.async_api import async_playwright

async def purchase(numbers: list[list[int]], user_id: str, password: str) -> dict:
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        try:
            page = await browser.new_page()
            await page.goto("https://dhlottery.co.kr/user.do?method=login")
            await page.fill("#userId", user_id)
            await page.fill("#password", password)
            await page.click(".btn_login")
            await page.wait_for_load_state("networkidle")

            if "login" in page.url:
                raise Exception("로그인 실패. 아이디/비밀번호를 확인하세요.")

            await page.goto("https://dhlottery.co.kr/game.do?method=buyLotto&wiselog=M_M_1_1")
            await page.wait_for_load_state("networkidle")

            for i, nums in enumerate(numbers[:5]):
                for j, n in enumerate(nums):
                    await page.click(f"#check645num{n}")
                if i < len(numbers) - 1:
                    await page.click("#btnSelectNum")

            await page.click("#btnBuy")
            await page.wait_for_selector(".confirm_layer", timeout=10000)
            await page.click(".confirm_layer .btn_confirm")
            await page.wait_for_selector(".result_layer", timeout=15000)
            receipt = await page.inner_text(".result_layer .receipt_no")

            return {"status": "success", "receipt": receipt.strip()}
        except Exception as e:
            return {"status": "failed", "error": str(e)}
        finally:
            await browser.close()
