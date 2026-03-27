/**
 * three/lever.js — 기어레버 (우측 패널)
 *
 * 구성:
 *   sidePanel  — 우측 보조 패널
 *   track      — 레버 이동 홈 (세로 원기둥)
 *   stick      — 레버 봉 (얇은 원기둥)
 *   knob       — 레버 손잡이 (구체, 복숭아색)
 *   ring       — 손잡이 테두리 (민트색 도넛)
 *
 * 클릭하면 레버가 아래로 당겨지는 애니메이션 + 슬롯 스핀 실행
 */

import * as THREE from 'three';
import { toon, rbox, add, machineGroup } from './helpers.js';
import { register } from './interactions.js';
import { state } from '../state.js';
import { showMsg, updateCredit } from '../ui.js';
import { playLever } from '../audio.js';

// 외부(spin.js)에서 애니메이션을 위해 접근할 수 있게 export
export let leverKnob  = null;
export let leverStick = null;

// 레버 기본 Y 위치 (애니메이션 후 복귀 기준)
const KNOB_BASE_Y  =  0.08;
const STICK_BASE_Y = -0.32;

export function buildLever() {
  // 우측 보조 패널
  add(rbox(0.62, 1.75, 1.22, 0.12, 3), toon(0xd0bdb0), 2.11, -0.72, 0);

  // 레버 홈 (세로 원기둥)
  add(
    new THREE.CylinderGeometry(0.055, 0.055, 1.25, 10),
    toon(0xb0a0a0),
    2.11, -0.82, 0.66
  );

  // 레버 봉 (얇은 원기둥)
  leverStick = new THREE.Mesh(
    new THREE.CylinderGeometry(0.038, 0.038, 0.68, 10),
    toon(0xc8b8b8)
  );
  leverStick.position.set(2.11, STICK_BASE_Y, 0.68);
  machineGroup.add(leverStick);

  // 레버 손잡이 구체 (복숭아색)
  leverKnob = new THREE.Mesh(
    new THREE.SphereGeometry(0.175, 14, 14),
    toon(0xffd4a7)
  );
  leverKnob.position.set(2.11, KNOB_BASE_Y, 0.68);
  machineGroup.add(leverKnob);

  // 손잡이 테두리 도넛 (민트)
  add(new THREE.TorusGeometry(0.18, 0.03, 7, 22), toon(0xa7f5ce), 2.11, KNOB_BASE_Y, 0.68);

  // 클릭 이벤트 등록 (손잡이 + 봉 둘 다)
  register(leverKnob,  pullLever);
  register(leverStick, pullLever);
}

// ── 레버 당기기 ───────────────────────────────────────────────────────
function pullLever() {
  if (state.spinning) return;
  if (state.credits <= 0) {
    showMsg('코인을 먼저 넣어주세요! 슬롯을 클릭하세요.', 2200);
    return;
  }

  state.credits--;
  updateCredit();

  // 레버 당김 애니메이션: 아래로 내려갔다가 복귀
  animatePull();
  playLever();

  // spin.js 의 doSpin 호출 (순환참조 방지를 위해 동적 import)
  import('../game/spin.js').then(({ doSpin }) => doSpin());
}

// ── 레버 당김 애니메이션 ─────────────────────────────────────────────
// setInterval로 직접 구현 (Three.js에 내장 트윈 없음)
// 실제 프로젝트에선 GSAP 같은 트윈 라이브러리를 많이 써요
function animatePull() {
  leverKnob.position.y  -= 0.82;
  leverStick.position.y -= 0.41;

  setTimeout(() => {
    leverKnob.position.y  = KNOB_BASE_Y;
    leverStick.position.y = STICK_BASE_Y;
  }, 380);
}

// ── 레버 idle 애니메이션 (main.js 루프에서 호출) ─────────────────────
export function animateLever(t) {
  if (!leverKnob || state.spinning) return;
  // 스핀 중이 아닐 때: 손잡이가 살살 앞뒤로 흔들림
  leverKnob.position.z = 0.68 + Math.sin(t * 0.9) * 0.015;
}
