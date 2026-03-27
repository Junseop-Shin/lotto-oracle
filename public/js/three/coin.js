/**
 * three/coin.js — 코인 슬롯 + 크레딧 시스템
 *
 * 구성:
 *   slotFrame  — 코인 투입구 프레임 (둥근 박스)
 *   slotHole   — 투입구 구멍 (검은 박스)
 *   indDot     — 앰버색 인디케이터 (pulse 애니메이션)
 *   coinMesh   — 동전 (CylinderGeometry, 납작한 원기둥)
 *   creditPanel— 크레딧 표시 패널
 *
 * 클릭하면:
 *   1. 동전이 슬롯 아래로 떨어지는 애니메이션
 *   2. credits + 1
 *   3. 동전 원위치 복귀
 */

import * as THREE from 'three';
import { toon, rbox, add, machineGroup } from './helpers.js';
import { register } from './interactions.js';
import { state } from '../state.js';
import { showMsg, updateCredit } from '../ui.js';
import { playCoin } from '../audio.js';

// 외부(main.js)에서 idle 애니메이션 접근용
export let coinMesh = null;
export let indDot   = null;

let coinDropping = false;

export function buildCoin() {
  // 코인 투입구 프레임
  const slotFrame = add(
    rbox(0.72, 0.28, 0.1, 0.07, 2),
    toon(0xd0bdb0),
    -0.9, -2.14, 0.83
  );

  // 투입구 구멍 (검은 박스 — MeshBasicMaterial: 빛 영향 없이 항상 검음)
  add(
    new THREE.BoxGeometry(0.46, 0.09, 0.05),
    new THREE.MeshBasicMaterial({ color: 0x111111 }),
    -0.9, -2.14, 0.875
  );

  // 앰버 인디케이터 도트
  indDot = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 10, 10),
    toon(0xffd166)
  );
  indDot.position.set(-0.9, -1.96, 0.88);
  machineGroup.add(indDot);

  // 동전: CylinderGeometry(위반지름, 아래반지름, 두께, 분할수)
  // 납작한 원기둥 → 동전 형태
  coinMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.105, 0.105, 0.02, 22),
    toon(0xffd166)
  );
  coinMesh.rotation.x = Math.PI / 2; // 세워진 동전처럼 정면을 향하게
  coinMesh.position.set(-0.9, -1.73, 0.88);
  machineGroup.add(coinMesh);

  // 크레딧 표시 패널 (보라색 작은 박스)
  add(rbox(0.82, 0.26, 0.07, 0.07, 2), toon(0x2d1b4e), 0.72, -2.14, 0.85);

  // 클릭 이벤트: 동전과 프레임 둘 다 등록
  register(coinMesh,  insertCoin);
  register(slotFrame, insertCoin);
}

// ── 코인 투입 ─────────────────────────────────────────────────────────
function insertCoin() {
  if (coinDropping) return; // 이미 떨어지는 중이면 무시
  coinDropping = true;

  state.credits = Math.min(state.credits + 1, 9); // 최대 9크레딧
  updateCredit();
  showMsg(`코인 투입! CREDIT: ${state.credits}`, 1800);
  playCoin();

  // 동전 낙하 애니메이션
  // setInterval로 매 16ms(≈60fps)마다 위치 업데이트
  const startY  = coinMesh.position.y;
  const targetY = -2.14; // 슬롯 구멍 위치
  let   progress = 0;

  const iv = setInterval(() => {
    progress += 0.07; // 속도 조절
    const t   = Math.min(progress, 1);
    // 선형 보간(lerp): startY에서 targetY로 부드럽게 이동
    coinMesh.position.y = startY + (targetY - startY) * t;
    coinMesh.rotation.y += 0.35; // 동전이 회전하며 떨어짐

    if (progress >= 1) {
      clearInterval(iv);
      // 0.25초 후 원위치로 복귀 (다음 투입을 위해)
      setTimeout(() => {
        coinMesh.position.y = -1.73;
        coinDropping = false;
      }, 250);
    }
  }, 16);
}

// ── 코인 idle 애니메이션 (main.js 루프에서 호출) ─────────────────────
export function animateCoin(t) {
  // 투입 중이 아닐 때: 동전이 위아래로 살살 떠다님 + 천천히 회전
  if (!coinDropping && coinMesh) {
    coinMesh.position.y  = -1.73 + Math.sin(t * 1.9) * 0.09;
    coinMesh.rotation.y += 0.022;
  }

  // 인디케이터 도트: sin 으로 크기 진동 (pulse 효과)
  if (indDot) {
    const s = 0.88 + Math.sin(t * 3.5) * 0.12;
    indDot.scale.set(s, s, s);
  }
}
