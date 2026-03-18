# Lotto Oracle

South Korean Lotto 6/45 번호 예측 시스템. 레트로 3D 아케이드 슬롯머신 UI로 구현했으며,
알고리즘 예측은 모두 사전 계산되어 SQLite에 저장 — API 요청 시점에 실시간 연산 없음.

## Table of Contents

- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Quick Start](#quick-start)
- [API Reference](#api-reference)
- [Database Schema](#database-schema)
- [Prediction Algorithms](#prediction-algorithms)
- [Data Collection](#data-collection)
- [Scheduler](#scheduler)
- [Three.js Frontend](#threejs-frontend)
- [Web Audio API](#web-audio-api)
- [State Management](#state-management)
- [Testing](#testing)
- [Key Design Patterns](#key-design-patterns)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend API | Python 3.14, FastAPI, Uvicorn |
| Database | SQLite3 (stdlib), no ORM |
| Matrix math | NumPy (46×46 transition matrices) |
| Data import | pandas, openpyxl |
| Live scraping | Playwright (headless Chromium) |
| Scheduling | APScheduler (AsyncIOScheduler) |
| 3D rendering | Three.js r163 (CDN via importmap) |
| Sound | Web Audio API — procedural synthesis, no audio files |
| Frontend | Vanilla ES Modules, no bundler, no framework |
| Tests (BE) | pytest, FastAPI TestClient, unittest.mock |
| Tests (FE) | Vitest, happy-dom |

---

## Project Structure

```
lotto-oracle/
├── src/
│   ├── main.py          # FastAPI app, lifespan, all endpoints
│   ├── database.py      # SQLite schema + query helpers
│   ├── analyzer.py      # 5 prediction algorithms + matrix cache
│   ├── fetcher.py       # Seed XLSX download + Playwright live scraping
│   └── scheduler.py     # APScheduler weekly fetch + daily health check
│
├── public/
│   ├── preview-3d.html  # Entry point: importmap + <canvas> + HUD divs
│   ├── style-3d.css
│   └── js/
│       ├── main.js          # init() + requestAnimationFrame loop
│       ├── state.js         # Shared mutable state (credits, selected, spinning…)
│       ├── api.js           # fetchStats / fetchGenerate / autoRefresh
│       ├── ui.js            # HUD DOM updates (updateCredit, showMsg, renderAlgoHint)
│       ├── audio.js         # Procedural sound synthesis (Web Audio API)
│       ├── game/
│       │   └── spin.js      # doSpin() — ties API call + reel animation
│       └── three/
│           ├── scene.js     # WebGLRenderer, camera, lights, OrbitControls
│           ├── helpers.js   # Toon material factory, RoundedBoxGeometry wrapper
│           ├── machine.js   # Cabinet body geometry
│           ├── screen.js    # CRT canvas texture + reel spin/stop animation
│           ├── buttons.js   # 5 algorithm selector buttons
│           ├── coin.js      # Coin insert + drop animation
│           └── lever.js     # Pull lever + spin trigger
│
├── tests/
│   ├── test_algorithms.py   # Algorithm unit tests + predictions table tests
│   ├── test_api.py          # FastAPI endpoint integration tests
│   └── ui/
│       ├── slot.test.js     # state.js exports + api.js fetch tests (Vitest)
│       ├── vitest.config.js
│       └── package.json
│
├── db/                  # lotto.db (gitignored, created on first run)
├── requirements.txt
└── .github/workflows/
    └── ci.yml           # Run tests on every PR
```

---

## Quick Start

```bash
git clone <repo-url>
cd lotto-oracle

python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium

uvicorn src.main:app --reload
```

### Seed historical data (one-time, ~1215 draws)

```bash
curl -X POST http://localhost:8000/api/fetch?mode=all
# {"fetched": 1215, "mode": "all"}
```

After seeding, all algorithm predictions are computed and stored automatically.
Visit **http://localhost:8000**

---

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/algorithms` | All algorithms `[{id, label, description}]` |
| `GET` | `/api/stats` | `{total, latest_draw_no}` |
| `POST` | `/api/fetch?mode=all` | Download seed XLSX → import all draws → compute predictions |
| `POST` | `/api/fetch?mode=latest` | Playwright scrape latest draw → save if new → recompute |
| `POST` | `/api/generate` | Return precomputed predictions (DB lookup only) |
| `GET` | `/` | Serve `preview-3d.html` |

### POST /api/generate

```json
// Request
{
  "methods": ["apriori", "markov", "ensemble"],
  "count_per_method": 1
}

// Response
[
  { "method": "apriori",  "numbers": [11,17,21,36,39,44], "score": 343.0, "draw_no": 1215 },
  { "method": "markov",   "numbers": [12,16,27,33,34,40], "score": 0.91,  "draw_no": 1215 },
  { "method": "ensemble", "numbers": [12,27,33,34,40,45], "score": 1.33,  "draw_no": 1215 }
]
```

Validation: `methods` 는 비어있을 수 없고 최대 3개, 값은 `{apriori, conditional, markov, ensemble, random}` 중 하나여야 함.

---

## Database Schema

SQLite — 파일 하나(`db/lotto.db`), 별도 서버 없음.

### `draws` — 역대 당첨번호

```sql
CREATE TABLE draws (
    draw_no     INTEGER PRIMARY KEY,
    draw_date   TEXT NOT NULL,
    n1 INTEGER, n2 INTEGER, n3 INTEGER,
    n4 INTEGER, n5 INTEGER, n6 INTEGER,
    bonus       INTEGER,
    prize_1st   INTEGER,    -- 1등 당첨금 (원)
    winners_1st INTEGER,    -- 1등 당첨자 수
    created_at  TEXT DEFAULT (datetime('now'))
);
```

### `analysis_cache` — 행렬 캐시

```sql
CREATE TABLE analysis_cache (
    key        TEXT PRIMARY KEY,   -- 'cooccurrence' | 'conditional' | 'markov'
    data       TEXT NOT NULL,      -- JSON-serialized 46×46 NumPy 행렬
    based_on   INTEGER NOT NULL,   -- 계산 시점의 latest draw_no (캐시 무효화 키)
    updated_at TEXT DEFAULT (datetime('now'))
);
```

**캐시 동작:** `based_on == current_latest_draw_no` 이면 재계산 생략.
새 회차 추가 시 `based_on` 이 달라지므로 자동으로 재계산 트리거.

### `predictions` — 알고리즘 예측 결과

```sql
CREATE TABLE predictions (
    draw_no    INTEGER NOT NULL,   -- 예측 기준 회차
    method     TEXT NOT NULL,      -- 알고리즘 이름
    numbers    TEXT NOT NULL,      -- JSON: [n1, n2, n3, n4, n5, n6]
    score      REAL,
    created_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (draw_no, method)  -- 복합 PK → INSERT OR IGNORE로 멱등성 보장
);
```

**설계 의도:** 결정론적 알고리즘은 동일 `draw_no` 입력에 항상 동일 출력이므로, 미리 계산해 저장 → `/api/generate` 는 DB 조회만 수행 (실시간 연산 없음).

---

## Prediction Algorithms

### 전체 흐름

```
새 회차 수집
    └─ compute_and_save_all()
           ├─ rebuild_all_caches()      # 3개 NumPy 행렬 재계산 + DB 저장
           └─ 알고리즘별 실행
                  └─ save_prediction(draw_no, method, numbers, score)

GET /api/generate
    └─ get_predictions(methods)         # DB 조회만, 연산 없음
```

### 행렬 구조 (공통 기반, 인덱스 0 미사용)

**공동출현 행렬 (46×46)**
```python
for draw in draws:
    for a, b in combinations(draw, 2):
        matrix[a][b] += 1
        matrix[b][a] += 1   # 대칭
```

**조건부확률 행렬 (46×46)**
```python
prob[a][b] = cooc[a][b] / freq[a]   # P(b | a)
```

**마르코프 전이행렬 (46×46)**
```python
for i in range(len(draws) - 1):
    for a in draws[i]:
        for b in draws[i+1]:
            transition[a][b] += 1
prob[a] = transition[a] / freq[a]   # P(b in t+1 | a in t)
```

---

### Algorithm 1: Apriori (연관규칙)

- 모든 번호 쌍에 대해 **Lift** 계산:
  ```
  lift(a, b) = P(a ∩ b) / (P(a) × P(b))
  ```
  Lift > 1 이면 우연보다 함께 출현하는 경향이 강함.
- Lift 최고인 두 번호를 시드로 선택.
- 나머지 4개는 공동출현 점수(`cooc[n][x]` 합)가 가장 높은 순으로 greedy 추가.
- Score = 선택된 6개의 모든 쌍 cooc 합.

### Algorithm 2: 조건부확률

- 전체 출현 빈도가 가장 높은 번호를 앵커로 선정.
- 매 단계: `Σ P(candidate | already_chosen)` 최대인 번호 추가 (greedy).
- Score = 선택된 쌍들의 조건부확률 평균.

### Algorithm 3: 마르코프 체인

- 직전 회차 번호들을 초기 상태로 사용.
- 전이 점수: `scores[b] += markov[a][b]` (직전 회차의 각 번호 a에 대해).
- 직전 회차에 나온 번호는 `× 0.5` 가중치 감소 (연속 출현 과대평가 보정).
- 점수 상위 6개 선택.

### Algorithm 4: 앙상블 (투표)

- Apriori + 조건부확률 + 마르코프 각 1회 실행.
- 각 알고리즘이 선택한 6개 번호에 1표씩.
- 총 득표수 기준 상위 6개 선택. 동점 시 전체 출현 빈도로 결정.
- Score = 선택 번호들의 평균 득표수.

### Algorithm 5: 랜덤

```python
random.sample(range(1, 46), 6)
```

버튼 미선택 시 기본값. Score = 0.0.

---

## Data Collection

### fetch_all() — 시드 부트스트랩

- **소스:** `superkts.com/lotto/download_excel.php` — 인증 없이 다운로드 가능한 XLSX (~82KB)
- pandas `read_excel()` → `executemany()` `INSERT OR IGNORE`
- **날짜 계산:** XLSX에 날짜 컬럼 없으므로 회차 번호로 역산
  ```python
  DRAW_1_DATE = date(2002, 12, 7)   # 1회차 = 2002년 12월 7일 (토요일)
  draw_date = DRAW_1_DATE + timedelta(weeks=draw_no - 1)
  ```

### fetch_latest() — Playwright 실시간 스크래핑

dhlottery의 기존 JSON API(`common.do?method=getLottoNumber`)는 서버에서 제거됨.
모든 직접 HTTP 요청에 302 반환. JavaScript 실행 + 봇 탐지 통과가 필요해 Playwright를 사용.

```
Playwright → Chromium headless 실행
    └─ page.goto('dhlottery.co.kr')
    └─ page.on('response', handler)    # XHR 인터셉트
           └─ URL에 'selectMainInfo.do' 포함 시 파싱
                  └─ data.result.pstLtEpstInfo.lt645[]  (최근 5회차)
```

파싱 필드 매핑:

| API 필드 | DB 컬럼 |
|---------|---------|
| `ltEpsd` | `draw_no` |
| `ltRflYmd` (YYYYMMDD) | `draw_date` |
| `tm1WnNo` ~ `tm6WnNo` | `n1` ~ `n6` |
| `bnsWnNo` | `bonus` |
| `rnk1WnAmt` | `prize_1st` |
| `rnk1WnNope` | `winners_1st` |

---

## Scheduler

```python
# APScheduler — AsyncIOScheduler, timezone=Asia/Seoul
CronTrigger(day_of_week='sat', hour=21, minute=10)  # 매주 토 21:10 — 새 회차 수집
CronTrigger(hour=3, minute=0)                        # 매일 03:00 — 캐시 정합성 검사
```

- **토요일 job:** `fetch_latest()` → 신규 회차 있으면 `compute_and_save_all()`
- **매일 job:** `analysis_cache.based_on != latest_draw_no` 인 키 존재 시 `compute_and_save_all()` 호출

---

## Three.js Frontend

### importmap — 번들러 없는 CDN 모듈

```html
<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.163/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.163/examples/jsm/"
  }
}
</script>
```

이후 모든 JS 파일에서 bare specifier 사용:

```js
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
```

### Scene (scene.js)

```js
// 의도적으로 antialias 끔 → 레트로 픽셀 느낌
renderer = new WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;

camera = new PerspectiveCamera(52, aspect, 0.1, 100);
camera.position.set(3.6, 1.6, 5.6);

scene.fog = new THREE.Fog(0xede4ff, 13, 22);   // 원거리 안개로 깊이감

// 조명 구성
new THREE.HemisphereLight(0xffffff, 0xf0e8ff, 2.2);   // 환경광 (sky/ground)
new THREE.DirectionalLight(0xfff5e0, 2.8);             // 키 라이트 + 그림자 (512px)
new THREE.DirectionalLight(0xe8f0ff, 0.8);             // 필 라이트 (역광 제거)
```

### Toon Shading (helpers.js)

```js
// 3단계 밝기의 그라디언트 맵 — NearestFilter로 경계 선명하게
const canvas = document.createElement('canvas');
canvas.width = 3; canvas.height = 1;
// 밝음(#fff) / 중간(#ddd) / 어두움(#aaa) 3픽셀
const gradMap = new THREE.CanvasTexture(canvas);
gradMap.minFilter = gradMap.magFilter = THREE.NearestFilter;

// MeshToonMaterial + gradientMap = 셀 쉐이딩 (만화 느낌)
export const toon = (color, extra = {}) =>
  new THREE.MeshToonMaterial({ color, gradientMap: gradMap, ...extra });
```

### CRT Screen — Canvas → GPU Texture Pipeline (screen.js)

```
2D Canvas (1024×600 offscreen)
  ctx.fillRect / ctx.fillText / ctx.createLinearGradient
      │
      ▼
THREE.CanvasTexture
      │  screenTexture.needsUpdate = true  ← CPU→GPU 재업로드 트리거
      ▼
MeshStandardMaterial.map
      │
      ▼
PlaneGeometry (3D 쿼드, 슬롯머신 화면 위치에 배치)
```

**릴 애니메이션 수식:**

```js
// Phase 1 — Ease-in 가속 (0 ~ ACCEL_DUR ms)
p = Math.min(elapsed / ACCEL_DUR, 1)
speed = p * p * (SPEED_MAX - SPEED_MIN) + SPEED_MIN   // quadratic ease-in (p²)

// Phase 2 — 감속 (stopDelay 경과 후)
speed *= 0.89   // 프레임당 지수 감쇠 (exponential ease-out)

// 부드러운 스크롤 — 정수+소수 분리로 sub-pixel 정확도
intPos = Math.floor(pos)
fracPos = pos - intPos
numY = centerY + (di - fracPos) * NUM_H   // di = -3 ~ +3 (윈도우 표시 범위)
```

**컬럼별 정지 타이밍 (왼쪽부터 순차 정지):**

```js
// 왼쪽(col 0) 1.8s, 오른쪽(col 5) 6.8s 후 정지
stopDelay = 1800 + columnIndex * 1000

// 컬럼마다 strip 길이 다르게 → 회전량 차이 → 시각적 다양성
STRIP_LEN = 85 + columnIndex * 26 + rowIndex * 4
```

**시각 효과:**
- 8px 간격 수평 스캔라인 (`rgba(0,0,0,0.1)`)
- 상하 알파 그라디언트 페이드
- 유리 글레어 오버레이 (대각선 흰색 반사광)
- 행별 알고리즘 태그 (오른쪽, 색상 pill)

### requestAnimationFrame Loop (main.js)

```js
let t = 0;
function animate() {
  requestAnimationFrame(animate);
  t += 0.016;                    // ~60fps 기준 누적 시간

  controls.update();             // OrbitControls 댐핑 inertia
  animateButtons(t);             // 선택된 버튼 sin파 pulse
  animateLever(t);               // 레버 손잡이 sin파 흔들림
  animateCoin(t);                // 동전 bob + 회전

  renderer.render(scene, camera);
}
```

모든 idle 애니메이션은 `Math.sin(t)` 기반 — 게임 상태와 독립적으로 부드럽게 실행.

### 3D 오브젝트 클릭 감지 (interactions.js)

```js
const raycaster = new THREE.Raycaster();

canvas.addEventListener('pointerdown', e => {
  // 화면 좌표 → NDC(Normalized Device Coordinates) 변환
  pointer.x = (e.clientX / width) * 2 - 1;
  pointer.y = -(e.clientY / height) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(clickTargets, true);
  if (hits.length) hits[0].object.userData.onClick();
});
```

---

## Web Audio API

외부 오디오 파일 없음 — 모든 소리를 JavaScript로 실시간 합성.

### AudioContext 노드 그래프

```
OscillatorNode ──────────────────────────────────────┐
                                                      ├─→ GainNode → destination
AudioBufferSourceNode → BiquadFilterNode (lowpass) ──┘
```

### 핵심 개념

| 개념 | 설명 |
|------|------|
| `AudioContext` | 페이지당 하나의 오디오 엔진. 사용자 제스처 전까지 `suspended` 상태. |
| `OscillatorNode` | `sine` / `square` / `triangle` / `sawtooth` 순수 파형 생성 |
| `AudioBufferSourceNode` | `Math.random() * 2 - 1` 로 채운 Float32Array → 화이트 노이즈 |
| `BiquadFilterNode (lowpass)` | 고주파 제거 → 타격음/클릭음의 따뜻한 질감 |
| `GainNode` | 볼륨 엔벨로프 |
| `exponentialRampToValueAtTime()` | 지수 페이드아웃 (선형보다 자연스럽게 들림) |

모든 타이밍은 `AudioContext.currentTime` 기준 초 단위로 미래 예약 — JS 루프와 무관하게 오디오 엔진이 정밀하게 실행.

### 사운드 합성

**playCoin() — 5단계 동전 낙하**

```
t+0ms  : 충격음   → noise(60ms,  9000Hz lowpass, vol 0.9)
t+1ms  : 금속 링  → triangle osc (4000→1200Hz sweep, 300ms)
t+11ms : 1차 반동 → noise(80ms,  7000Hz) + triangle (2800→900Hz)
t+19ms : 2차 반동 → noise(80ms,  5500Hz)
t+26ms : 굴러가기 → noise(220ms, 3500Hz, slow decay)
```

**playLever() — 기계식 당김**

```
t+0ms  : 충격   → noise(90ms,  180Hz, vol 0.7)
t+5ms  : 마찰음 → noise(250ms, 400Hz)
t+38ms : 클릭   → noise(60ms,  220Hz)
```

**startSpinAudio() — 래칫 클릭 (감속 시뮬레이션)**

```js
interval = 55ms (초기)
// 매 클릭: noise(25ms, 2200Hz)
// 다음 간격 *= 1.02  → 점점 느려짐 (최대 220ms)
```

**playComplete() — 승리 아르페지오**

```
C5 (523Hz) → E5 (659Hz) → G5 (784Hz) → C6 (1047Hz)
각 음: sine 기본 + 2배 주파수 하모닉 (배음)
13ms 간격, 마지막: 8000Hz 스파클 노이즈 버스트
```

---

## State Management

JavaScript 객체는 참조로 전달 → 여러 모듈이 동일한 `state` 객체를 import하면 항상 최신값 공유.

```js
// state.js
export const state = {
  credits:  3,
  selected: new Set(),    // 선택된 버튼 인덱스 (0~4)
  spinning: false,        // 스핀 중 잠금 플래그
  ballData: [             // CRT에 표시 중인 3×6 번호
    [ 7, 15, 23, 31, 38, 42],
    [ 3, 18, 22, 29, 34, 45],
    [11, 20, 27, 33, 37, 43],
  ],
  algoTags: ['RANDOM', 'RANDOM', 'RANDOM'],
  stats: null,
};

// coin.js에서 수정 → lever.js에서 즉시 반영
import { state } from '../state.js';
state.credits++;
```

**볼 번호 → 색상 변환 (두 가지 포맷):**

```js
// Three.js MeshToonMaterial.color 용 (정수 hex)
export const ballColorInt = n =>
  n <= 10 ? 0xfbbf24 : n <= 20 ? 0x60a5fa : n <= 30 ? 0xf87171 :
  n <= 40 ? 0x9ca3af : 0x4ade80;

// Canvas 2D ctx.fillStyle 용 (CSS 문자열)
export const ballColorCSS = n =>
  n <= 10 ? '#fbbf24' : n <= 20 ? '#60a5fa' : n <= 30 ? '#f87171' :
  n <= 40 ? '#9ca3af' : '#4ade80';

// 1–10 노랑  11–20 파랑  21–30 빨강  31–40 회색  41–45 초록
```

---

## Testing

### Backend

```bash
PYTHONPATH=. pytest tests/test_algorithms.py tests/test_api.py -v
```

**test_algorithms.py**

- `setup_db` fixture: `monkeypatch` 로 `DB_PATH` 를 `tmp_path` 로 교체 → 테스트마다 격리된 임시 DB
- 5개 알고리즘 각각: 유효한 출력(6개, 중복 없음, 1–45), method 레이블, count 파라미터
- `TestPredictions`: `save_prediction` 멱등성(동일 draw_no+method 두 번 저장 시 첫 번째 유지), `get_predictions` 최신 draw_no 필터링, `compute_and_save_all()` 전체 알고리즘 커버리지

**test_api.py**

```python
@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(db_module, "DB_PATH", tmp_path / "test.db")
    monkeypatch.setattr(main_module, "setup_scheduler", lambda: None)  # 스케줄러 비활성화
    with TestClient(app) as c:
        yield c
```

- `fetch_latest` / `fetch_all` 는 `AsyncMock` 으로 대체 (외부 의존성 제거)
- 422 Validation 케이스: unknown method, too many methods (>3), empty list

### Frontend

```bash
cd tests/ui && npm test
```

**slot.test.js** — Vitest + happy-dom

```js
// ui.js 는 모듈 로드 시점에 document.getElementById() 호출 → 테스트 환경에서 null 반환
// vi.mock 으로 완전 대체해 side effect 차단
vi.mock('../../public/js/ui.js', () => ({
  showMsg: vi.fn(),
  updateDataStatus: vi.fn(),
}));
```

- `state.js`: 초기값, `ALGOS` 5개 구성, `ballColorInt/CSS` 색상 범위 경계값
- `api.js`: `fetchStats` 정상/실패/non-ok 응답, `fetchGenerate` 요청 body 검증 + 서버 실패 시 fallback 랜덤

---

## Key Design Patterns

### 1. Shared Mutable State (JavaScript 객체 참조)

여러 파일이 동일 객체를 import → A 파일이 `state.credits++` 하면 B 파일도 즉시 반영.
React나 Store 없이 상태를 공유하는 가장 단순한 패턴.

### 2. Canvas → GPU Texture (`needsUpdate`)

```js
ctx.fillText(number, x, y);          // CPU: 2D canvas 드로잉
screenTexture.needsUpdate = true;     // 이 플래그 하나로 다음 렌더 사이클에 GPU 재업로드
```

Three.js 는 `needsUpdate = true` 를 감지해 다음 `renderer.render()` 시 CPU 데이터를 GPU로 업로드.

### 3. Quadratic Ease-in + Exponential Ease-out

```js
speed = p * p * (SPEED_MAX - SPEED_MIN) + SPEED_MIN  // p²: 자연스러운 가속
speed *= 0.89                                          // 지수 감쇠: 관성 시뮬레이션
```

물리적으로 자연스러운 움직임을 수식 두 줄로 구현.

### 4. Procedural Audio (No Audio Files)

Web Audio API 노드 그래프로 소리를 실시간 합성. 배포 시 오디오 파일 불필요.
모든 타이밍은 `AudioContext.currentTime` 기준으로 미래 예약 → 정밀한 타이밍 보장.

### 5. Idempotent Batch Writes

```sql
INSERT OR IGNORE INTO predictions (draw_no, method, ...) VALUES (?, ?, ...)
-- (draw_no, method) 복합 PK → 동일 쌍은 무시
```

스케줄러나 수동 재실행 시 중복 저장 없음.

### 6. Matrix Cache Invalidation

```python
cached = get_cache("cooccurrence")
if cached and cached["based_on"] == latest_draw_no:
    return cached["data"]   # 재계산 불필요
# based_on != latest → 새 회차 있음 → 재계산
```

고비용 NumPy 연산을 DB에 JSON 직렬화 저장. 회차 번호를 캐시 무효화 키로 사용.

### 7. Playwright XHR Interception

dhlottery 사이트가 JavaScript 봇 탐지(`tracer API`)를 사용하므로 headless browser 필수.
`page.on('response', handler)` 로 페이지가 자동 호출하는 XHR을 가로채 파싱 → 직접 HTTP 호출 없이 데이터 수집.

### 8. importmap (번들러 없는 ES 모듈)

```html
<script type="importmap">{"imports": {"three": "...cdn..."}}</script>
```

Webpack/Vite 없이 브라우저 네이티브 ES 모듈로 Three.js 사용. 빌드 단계 불필요, 소스 그대로 배포.

### 9. Deterministic Precomputation

알고리즘은 동일 입력(draw history)에 항상 동일 출력 → 새 회차마다 한 번만 계산해서 저장.
API 요청 시점에는 DB 조회만 → 응답 지연 최소화.
