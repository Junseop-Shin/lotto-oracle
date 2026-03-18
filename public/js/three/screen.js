/**
 * three/screen.js — CRT 스크린 (CanvasTexture) + 슬롯 릴 애니메이션
 *
 * ── 슬롯 릴 애니메이션 원리 ───────────────────────────────────────────
 *
 *  각 볼 위치(3행 × 6열 = 18개)마다 독립적인 "릴(reel)"이 있어요.
 *  릴은 숫자들이 적힌 긴 테이프(strip)라고 생각하면 돼요.
 *
 *  [  7  ]  ←── 위에서 흘러내려옴
 *  [ 23  ]  ←── 중앙 = 현재 보이는 숫자
 *  [ 41  ]  ←── 아래로 사라짐
 *
 *  애니메이션 흐름:
 *  1. 스핀 시작: 모든 릴이 빠르게 돌기 시작 (pos 증가)
 *  2. 열 0부터 순서대로 감속 시작 (stopDelay 시간 후)
 *  3. 감속: speed에 감속율(0.89) 곱해서 서서히 느려짐
 *  4. 최종 숫자에 딱 맞게 정지
 *
 *  구현:
 *  - strip: 랜덤 숫자 배열 + 마지막에 최종 번호
 *  - pos: strip 안에서 현재 위치 (float, 소수점 부분으로 부드러운 스크롤)
 *  - 그리기: floor(pos) 기준으로 위아래 숫자들을 그림
 *    y = centerY + (i - frac) * NUM_H  (frac = pos의 소수점 부분)
 *
 *  Three.js의 CanvasTexture는 needsUpdate=true 로 설정하면
 *  다음 renderer.render() 호출 시 GPU에 새 텍스처를 업로드해요.
 *  → 별도의 requestAnimationFrame 루프로 캔버스를 그리고,
 *    Three.js 렌더 루프가 자동으로 최신 텍스처를 사용해요.
 */

import * as THREE from 'three';
import { toon, rbox, add } from './helpers.js';
import { state, TAG_COLORS, ballColorCSS } from '../state.js';
import { startSpinAudio, stopSpinAudio, playReelStop } from '../audio.js';

// ── 캔버스 생성 ───────────────────────────────────────────────────────
const cv  = document.createElement('canvas');
cv.width  = 1024;
cv.height = 600;
const ctx = cv.getContext('2d');

export const screenTexture = new THREE.CanvasTexture(cv);

// ── 레이아웃 상수 ─────────────────────────────────────────────────────
const SLOT_W       = 96;   // 슬롯 창 너비 (px)
const SLOT_H       = 168;  // 슬롯 창 높이 (3개 숫자 표시)
const NUM_H        = 56;   // 릴 안 숫자 1개당 높이
const COL_SPACING  = 130;  // 열 간격
const COL_FIRST_CX = 82;   // 첫 번째 열 중심 x
const ROW_SPACING  = 184;  // 행 간격
const ROW_FIRST_Y  = 36;   // 첫 번째 행 슬롯 상단 y
const TAG_CX       = 910;  // 알고리즘 태그 중심 x

// ── 릴 상태 ──────────────────────────────────────────────────────────
let reels           = null;  // 스핀 중일 때 릴 배열, null이면 정적 표시
let spinStartTime   = null;
let spinFinalData   = null;
let spinDoneCallback = null;
let rafId           = null;

// ── 스핀 시작 ─────────────────────────────────────────────────────────
export function startSpin(finalData, onDone) {
  if (rafId) cancelAnimationFrame(rafId);

  spinFinalData    = finalData;
  spinDoneCallback = onDone;
  spinStartTime    = null;

  // 18개 릴 초기화 (3행 × 6열)
  reels = [];
  for (let ri = 0; ri < 3; ri++) {
    for (let ci = 0; ci < 6; ci++) {
      const finalNum = finalData[ri][ci];

      // 열별 정지 딜레이: 왼쪽(0열)→오른쪽(5열) 순으로 1.0초씩 간격
      // 오른쪽 열은 충분히 늦게 멈춰서 숫자를 확인할 시간을 줌
      const stopDelay = 1800 + ci * 1000;

      // strip 길이: 감속 시작 전까지 이동할 거리를 충분히 확보
      // 가속구간(700ms ≈ 43프레임, 평균속도 0.22) + 순항구간 + 여유
      // stopDelay ms / 16ms * 0.42 ≈ 최대 이동거리
      const STRIP_LEN = 85 + ci * 26 + ri * 4;
      const strip     = Array.from({ length: STRIP_LEN },
        () => Math.floor(Math.random() * 45) + 1
      );
      strip.push(finalNum); // strip 마지막 = 최종 번호

      reels.push({
        ri, ci,
        strip,
        pos:     0,
        speed:   0.05,  // 가속 시작 속도 (tickReels에서 매 프레임 갱신됨)
        stopped: false,
        stopDelay,
      });
    }
  }

  startSpinAudio();
  rafId = requestAnimationFrame(tickReels);
}

// ── 릴 속도 상수 ─────────────────────────────────────────────────────
const ACCEL_DUR  = 700;   // 가속 구간 길이 (ms): 이 시간 동안 ease-in
const SPEED_MIN  = 0.05;  // 가속 시작 속도
const SPEED_MAX  = 0.42;  // 순항 속도 (최대)

// ── 릴 애니메이션 틱 (requestAnimationFrame 루프) ─────────────────────
function tickReels(timestamp) {
  if (!spinStartTime) spinStartTime = timestamp;
  const elapsed = timestamp - spinStartTime; // 경과 시간 (ms)

  // ── 전체 공통 가속 곡선 (ease-in quadratic) ─────────────────────
  // 처음 ACCEL_DUR ms 동안 SPEED_MIN → SPEED_MAX 로 부드럽게 가속
  // p² 곡선: 처음엔 느리게, 갈수록 빠르게 (0,30,60,90,120... 느낌)
  const p          = Math.min(elapsed / ACCEL_DUR, 1);  // 0→1
  const cruiseSpeed = SPEED_MIN + (SPEED_MAX - SPEED_MIN) * (p * p);

  reels.forEach(reel => {
    if (reel.stopped) return;

    if (elapsed >= reel.stopDelay) {
      // ── 감속 구간: 매 프레임 9% 감속 (ease-out exponential) ────
      reel.speed *= 0.89;
    } else {
      // ── 가속/순항: 전체 공통 곡선 따라감 ───────────────────────
      reel.speed = cruiseSpeed;
    }

    reel.pos = Math.min(reel.pos + reel.speed, reel.strip.length - 1);

    // 최종 위치 도달하거나 속도가 거의 0이면 정지
    if (reel.pos >= reel.strip.length - 1 || reel.speed < 0.008) {
      reel.pos     = reel.strip.length - 1;
      reel.stopped = true;
      // 같은 열(ci)의 첫 번째 릴이 멈출 때만 정지음 (열당 1번)
      if (reel.ri === 0) playReelStop();
    }
  });

  drawReelFrame();

  if (reels.every(r => r.stopped)) {
    // 모든 릴 정지 → 최종 상태로 정리
    stopSpinAudio();
    state.ballData  = spinFinalData.map(row => [...row]);
    reels           = null;
    spinStartTime   = null;
    rafId           = null;
    drawScreen();                        // 정적 화면으로 전환
    if (spinDoneCallback) {
      spinDoneCallback();
      spinDoneCallback = null;
    }
  } else {
    rafId = requestAnimationFrame(tickReels);
  }
}

// ── 릴 프레임 그리기 ─────────────────────────────────────────────────
function drawReelFrame() {
  ctx.fillStyle = '#151c30';
  ctx.fillRect(0, 0, cv.width, cv.height);
  scanlines();

  for (let ri = 0; ri < 3; ri++) {
    for (let ci = 0; ci < 6; ci++) {
      const reel = reels.find(r => r.ri === ri && r.ci === ci);
      if (!reel) continue;
      const cx    = COL_FIRST_CX + ci * COL_SPACING;
      const slotY = ROW_FIRST_Y + ri * ROW_SPACING;
      drawSlot(reel, cx, slotY);
    }
    drawAlgoTag(ri);
  }

  drawGlassOverlay();
  screenTexture.needsUpdate = true; // GPU 텍스처 업로드 요청
}

// ── 슬롯 하나 그리기 ──────────────────────────────────────────────────
function drawSlot(reel, cx, slotY) {
  const slotX   = cx - SLOT_W / 2;
  const centerY = slotY + SLOT_H / 2;

  // 슬롯 배경
  ctx.fillStyle = '#1a2540';
  ctx.beginPath();
  ctx.roundRect(slotX, slotY, SLOT_W, SLOT_H, 10);
  ctx.fill();

  // 클리핑: 슬롯 창 밖으로 숫자가 삐져나오지 않게
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(slotX, slotY, SLOT_W, SLOT_H, 10);
  ctx.clip();

  const intPos  = Math.floor(reel.pos);
  const fracPos = reel.pos - intPos; // 소수점 부분 → 스크롤 오프셋

  // 현재 위치 기준으로 위아래 숫자들 그리기
  for (let di = -3; di <= 3; di++) {
    const idx = intPos + di;
    if (idx < 0 || idx >= reel.strip.length) continue;

    const num  = reel.strip[idx];
    // fracPos 만큼 위로 당겨진 위치 → 자연스러운 스크롤 느낌
    const numY = centerY + (di - fracPos) * NUM_H;

    if (numY < slotY - NUM_H || numY > slotY + SLOT_H + NUM_H) continue;

    // 중앙에서 멀수록 투명하게 (페이드 효과)
    const distFromCenter = Math.abs(numY - centerY) / (SLOT_H / 2);
    ctx.globalAlpha = Math.max(0.08, 1 - distFromCenter * 1.1);

    drawReelBall(cx, numY, num, 22);
  }

  ctx.globalAlpha = 1;
  ctx.restore();

  // 위/아래 그라디언트 페이드 (스크롤 몰입감)
  const fadeH = 52;
  const mkGrad = (y0, y1, a0, a1) => {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, `rgba(21,28,48,${a0})`);
    g.addColorStop(1, `rgba(21,28,48,${a1})`);
    return g;
  };
  ctx.fillStyle = mkGrad(slotY, slotY + fadeH, 1, 0);
  ctx.fillRect(slotX, slotY, SLOT_W, fadeH);
  ctx.fillStyle = mkGrad(slotY + SLOT_H - fadeH, slotY + SLOT_H, 0, 1);
  ctx.fillRect(slotX, slotY + SLOT_H - fadeH, SLOT_W, fadeH);

  // 정지 후 선택 표시선
  if (reel.stopped) {
    ctx.strokeStyle = 'rgba(255,240,160,0.7)';
    ctx.lineWidth   = 2;
    ctx.strokeRect(slotX + 3, centerY - NUM_H / 2, SLOT_W - 6, NUM_H);
  }
}

// ── 릴 볼 그리기 (작은 버전) ──────────────────────────────────────────
function drawReelBall(cx, cy, num, r) {
  // 볼 본체
  ctx.fillStyle = ballColorCSS(num);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  // 번호
  ctx.fillStyle = '#111';
  ctx.font = `bold ${Math.round(r * 0.88)}px "Courier New"`;
  ctx.textAlign     = 'center';
  ctx.textBaseline  = 'middle';
  ctx.fillText(num.toString(), cx, cy + 1);
}

// ── 알고리즘 태그 그리기 (행마다 오른쪽) ─────────────────────────────
function drawAlgoTag(ri) {
  const tagY   = ROW_FIRST_Y + ri * ROW_SPACING + SLOT_H / 2;
  const label  = state.algoTags[ri] ?? 'RANDOM';
  const tw     = 150;

  ctx.fillStyle = TAG_COLORS[ri];
  ctx.beginPath();
  ctx.roundRect(TAG_CX - tw / 2, tagY - 22, tw, 44, 10);
  ctx.fill();

  ctx.fillStyle    = '#333';
  ctx.font         = 'bold 20px "Courier New"';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, TAG_CX, tagY);
}

// ── 유리 화면 반사 오버레이 (전체 화면에 한 번만) ───────────────────
// 실제 CRT 유리에 빛이 반사되는 효과: 좌상단에서 우하단으로 흐르는 대각선 글레어
function drawGlassOverlay() {
  // 상단 대각선 글레어 (좌상 → 우상, 넓은 빛줄기)
  const glare = ctx.createLinearGradient(0, 0, cv.width * 0.6, cv.height * 0.45);
  glare.addColorStop(0,    'rgba(255,255,255,0.07)');
  glare.addColorStop(0.35, 'rgba(255,255,255,0.04)');
  glare.addColorStop(0.6,  'rgba(255,255,255,0.01)');
  glare.addColorStop(1,    'rgba(255,255,255,0)');
  ctx.fillStyle = glare;
  ctx.fillRect(0, 0, cv.width, cv.height);

  // 화면 상단 테두리 안쪽 얇은 밝은 선 (유리 두께 느낌)
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth   = 3;
  ctx.strokeRect(4, 4, cv.width - 8, cv.height - 8);
}

// ── CRT 스캔라인 효과 ────────────────────────────────────────────────
function scanlines() {
  for (let y = 0; y < cv.height; y += 8) {
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.fillRect(0, y, cv.width, 3);
  }
}

// ── 정적 화면 그리기 (스핀 없을 때) ─────────────────────────────────
export function drawScreen() {
  ctx.fillStyle = '#151c30';
  ctx.fillRect(0, 0, cv.width, cv.height);
  scanlines();

  state.ballData.forEach((row, ri) => {
    row.forEach((num, ci) => {
      const cx    = COL_FIRST_CX + ci * COL_SPACING;
      const slotY = ROW_FIRST_Y + ri * ROW_SPACING;
      const slotX = cx - SLOT_W / 2;

      // 슬롯 배경
      ctx.fillStyle = '#1c2b45';
      ctx.beginPath();
      ctx.roundRect(slotX, slotY, SLOT_W, SLOT_H, 10);
      ctx.fill();

      // 볼 그리기 (큰 버전 — 정적 표시)
      drawBigBall(cx, slotY + SLOT_H / 2, num);

      // 선택 표시선
      ctx.strokeStyle = 'rgba(255,240,160,0.5)';
      ctx.lineWidth   = 1.5;
      ctx.strokeRect(slotX + 3, slotY + SLOT_H / 2 - NUM_H / 2, SLOT_W - 6, NUM_H);
    });
    drawAlgoTag(ri);
  });

  drawGlassOverlay();
  screenTexture.needsUpdate = true;
}

// ── 정적 화면용 큰 볼 ────────────────────────────────────────────────
function drawBigBall(cx, cy, num) {
  const r = 34;

  // 볼
  ctx.fillStyle = ballColorCSS(num);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  // 번호
  ctx.fillStyle    = '#111';
  ctx.font         = 'bold 26px "Courier New"';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(num.toString(), cx, cy + 1);
}

// ── 3D 스크린 오브젝트 빌드 ──────────────────────────────────────────
export function buildScreen() {
  add(rbox(2.92, 1.92, 0.12, 0.1, 3), toon(0xc4b0a0), 0, 0.9, 0.84);

  add(
    new THREE.PlaneGeometry(2.5, 1.5),
    new THREE.MeshToonMaterial({ map: screenTexture, gradientMap: null }),
    0, 0.9, 0.91
  );

  const bdr = toon(0xffb3a7);
  [
    [2.56, 0.07, 0,      1.655, 0.92],
    [2.56, 0.07, 0,      0.145, 0.92],
    [0.07, 1.56, -1.257, 0.9,   0.92],
    [0.07, 1.56,  1.257, 0.9,   0.92],
  ].forEach(([w, h, x, y, z]) =>
    add(new THREE.BoxGeometry(w, h, 0.02), bdr, x, y, z)
  );
}
