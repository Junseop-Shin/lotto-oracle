/**
 * main.js — 진입점: 모든 모듈 초기화 + 메인 애니메이션 루프
 *
 * ES Module 시스템에서 이 파일이 가장 먼저 실행돼요.
 * HTML의 <script type="module" src="js/main.js"> 로 로드됩니다.
 *
 * ── 실행 순서 ─────────────────────────────────────────────────────────
 * 1. Three.js 씬/카메라/렌더러 초기화 (scene.js 가 import되는 순간 실행)
 * 2. 각 3D 오브젝트 build 함수 호출 (기계 → 스크린 → 볼 → 버튼 → 레버 → 코인)
 * 3. 클릭 인터랙션 설정 (setupInteractions)
 * 4. API 자동 최신화 (autoRefresh) — 비동기, 백그라운드 실행
 * 5. 애니메이션 루프 시작 (requestAnimationFrame)
 *
 * ── 애니메이션 루프란? ──────────────────────────────────────────────
 * requestAnimationFrame(callback):
 *   - 브라우저가 다음 화면을 그리기 직전에 callback 을 호출해요
 *   - 보통 1초에 60번 (60fps)
 *   - 루프 안에서 자기 자신을 다시 호출 → 무한 반복
 *   - setTimeout(16ms) 과 달리 탭이 백그라운드면 자동으로 멈춤 (배터리 절약)
 */

// ── Three.js 핵심 (import 순서에 주의: 의존성 먼저) ─────────────────
import { scene, camera, renderer, controls } from './three/scene.js';

// ── 3D 오브젝트 빌더 ─────────────────────────────────────────────────
import { buildMachine }           from './three/machine.js';
import { buildScreen, drawScreen } from './three/screen.js';
// balls.js 의 3D 구체는 제거 — CRT 캔버스가 이미 볼을 그리므로 중복
// syncBallColors·popRow 는 spin.js 에서 직접 import해서 사용
import { buildButtons }      from './three/buttons.js';
import { buildLever }        from './three/lever.js';
import { buildCoin }         from './three/coin.js';

// ── 애니메이션 함수 ───────────────────────────────────────────────────
import { animateButtons }    from './three/buttons.js';
import { animateLever }      from './three/lever.js';
import { animateCoin }       from './three/coin.js';

// ── 인터랙션 ─────────────────────────────────────────────────────────
import { setupInteractions } from './three/interactions.js';

// ── 앱 로직 ──────────────────────────────────────────────────────────
import { autoRefresh }       from './api.js';
import { renderAlgoHint }    from './ui.js';

// ── 바닥면 (floor) ────────────────────────────────────────────────────
// main.js 에서 직접 만들어도 되는 단순한 요소
import * as THREE from 'three';
import { toon, add } from './three/helpers.js';

function buildFloor() {
  // PlaneGeometry: 납작한 평면 (회전해서 바닥으로 사용)
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(24, 24),
    toon(0xe0d8f5) // 연보라 파스텔 바닥
  );
  floor.rotation.x = -Math.PI / 2; // 수평으로 눕힘 (기본은 수직 평면)
  floor.position.y = -2.68;
  floor.receiveShadow = true;
  scene.add(floor);
}

// ════════════════════════════════════════════════════════════════════
//  초기화
// ════════════════════════════════════════════════════════════════════
function init() {
  // 3D 오브젝트 빌드 (순서 중요: 뒤에 있는 것이 앞에 그려짐)
  buildMachine();   // 기계 본체
  buildScreen();    // CRT 스크린 (볼은 캔버스에 2D로 그려짐)
  buildButtons();   // 오락실 버튼
  buildLever();     // 기어레버
  buildCoin();      // 코인 슬롯
  buildFloor();     // 바닥

  // 초기 화면 그리기
  drawScreen();
  renderAlgoHint();

  // 마우스 인터랙션 설정
  const canvas = renderer.domElement;
  setupInteractions(canvas);

  // 자동 데이터 최신화 (백그라운드 실행, UI 블로킹 없음)
  autoRefresh().catch(err => console.warn('[autoRefresh]', err));
}

// ════════════════════════════════════════════════════════════════════
//  메인 애니메이션 루프
// ════════════════════════════════════════════════════════════════════
let t = 0; // 경과 시간 (초 단위, sin/cos 계산에 사용)

function animate() {
  // 다음 프레임에 다시 animate 호출 예약
  requestAnimationFrame(animate);

  t += 0.016; // 약 60fps 기준 1프레임 = 0.016초

  // OrbitControls: enableDamping=true 이면 update() 를 매 프레임 호출해야 함
  controls.update();

  // 각 모듈의 idle 애니메이션
  animateButtons(t);
  animateLever(t);
  animateCoin(t);

  // 최종 렌더: scene + camera → canvas에 픽셀로 출력
  renderer.render(scene, camera);
}

// ── 실행 ─────────────────────────────────────────────────────────────
init();
animate();
