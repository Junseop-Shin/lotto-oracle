/**
 * three/buttons.js — 오락실 스타일 아케이드 버튼 5개
 *
 * 버튼 구조 (레이어):
 *   housing  — 사각형 하우징 (버튼 주변 틀)
 *   btn      — 원기둥 버튼 면 (CylinderGeometry)
 *   rim      — 도넛 테두리 (TorusGeometry)
 *
 * CylinderGeometry(radiusTop, radiusBottom, height, segments)
 *   - radiusTop = radiusBottom → 균일한 원기둥
 *   - rotation.x = π/2 로 눕혀야 정면을 향함 (기본은 Y축이 위)
 *
 * TorusGeometry(radius, tube, radialSegments, tubularSegments)
 *   - radius: 도넛 중심 반지름
 *   - tube: 튜브 두께
 */

import * as THREE from 'three';
import { toon, rbox, add, machineGroup } from './helpers.js';
import { register } from './interactions.js';
import { state, ALGOS, MAX_SELECT } from '../state.js';
import { showMsg, renderAlgoHint } from '../ui.js';
import { drawScreen } from './screen.js';
import { playButton } from '../audio.js';

// 버튼 위치: [x, y] (z는 고정값 사용)
const BTN_POS = [
  [-0.95, -0.88], [-0.32, -0.88], [0.31, -0.88], // 위 3개
  [-0.64, -1.50], [ 0.00, -1.50],                 // 아래 2개
];

// 외부에서 애니메이션·색상 제어할 수 있게 export
export const btnMeshes = [];

export function buildButtons() {
  // 버튼 위 라벨 패널 (장식용 가로 바)
  add(rbox(2.5, 0.28, 0.08, 0.06, 2), toon(0xd0bdb0), -0.32, -0.38, 0.85);

  BTN_POS.forEach(([bx, by], i) => {
    const { colorOff } = ALGOS[i];

    // 하우징 (사각 틀)
    add(rbox(0.52, 0.52, 0.18, 0.1, 2), toon(0xd0bdb0), bx, by, 0.82);

    // 버튼 원기둥: scene.add 직접 호출 (helpers의 add 대신)
    // → rotation 설정이 필요해서 Mesh를 직접 만들어요
    const btn = new THREE.Mesh(
      new THREE.CylinderGeometry(0.185, 0.185, 0.13, 18),
      toon(colorOff)
    );
    btn.rotation.x = Math.PI / 2; // Y축→Z축 방향으로 눕힘 (정면을 향하게)
    btn.position.set(bx, by, 0.90);
    machineGroup.add(btn);
    btnMeshes.push(btn);

    // 테두리 도넛
    add(new THREE.TorusGeometry(0.195, 0.028, 7, 22), toon(0xbcaa9e), bx, by, 0.91);

    // 클릭 이벤트 등록
    register(btn, () => toggleBtn(i));
  });
}

// ── 버튼 토글 ─────────────────────────────────────────────────────────
function toggleBtn(i) {
  if (state.spinning) return;

  if (state.selected.has(i)) {
    // 선택 해제
    state.selected.delete(i);
    btnMeshes[i].material.color.setHex(ALGOS[i].colorOff);
    btnMeshes[i].position.z = 0.90;
    playButton(false);
  } else {
    if (state.selected.size >= MAX_SELECT) {
      showMsg('최대 3개만 선택 가능해요!', 1800);
      return;
    }
    // 선택: 색상 변경 + 살짝 눌린 위치로
    state.selected.add(i);
    btnMeshes[i].material.color.setHex(ALGOS[i].colorOn);
    btnMeshes[i].position.z = 0.875;
    playButton(true);
  }
  rebuildTags();
}

// ── 알고리즘 태그 재계산 ─────────────────────────────────────────────
// 선택된 버튼 → 알고리즘 이름 → 3개 미만이면 'RANDOM' 으로 채움
function rebuildTags() {
  const picks = [...state.selected].map(i => ALGOS[i].label.toUpperCase().replace('.', ''));
  while (picks.length < 3) picks.push('RANDOM');
  state.algoTags = picks.slice(0, 3);
  drawScreen();
  renderAlgoHint();
}

// ── 선택된 버튼 idle 애니메이션 (main.js 루프에서 호출) ───────────────
export function animateButtons(t) {
  BTN_POS.forEach(([, ], i) => {
    if (state.selected.has(i)) {
      // 선택된 버튼: sin 파동으로 미세하게 진동
      btnMeshes[i].position.z = 0.875 + Math.sin(t * 3.2 + i) * 0.007;
    }
  });
}
