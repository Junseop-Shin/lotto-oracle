/**
 * three/balls.js — CRT 스크린 앞에 떠있는 3D 로또볼 구체
 *
 * 스크린 캔버스에 2D로 볼을 그리는 것과 별개로,
 * 실제 3D 구체(SphereGeometry)를 스크린 앞에 배치해서
 * 입체감을 더해요.
 *
 * SphereGeometry(radius, widthSegments, heightSegments)
 *   - radius: 반지름
 *   - widthSegments: 가로 분할 수 (많을수록 부드럽지만 무거움)
 *   - heightSegments: 세로 분할 수
 *   - 레트로 느낌이니까 10×10 정도로 낮게 유지
 */

import * as THREE from 'three';
import { toon, add } from './helpers.js';
import { state, ballColorInt } from '../state.js';

// 모든 볼 Mesh 를 2D 배열로 관리: ballMeshes[줄번호][볼번호]
export const ballMeshes = [];

export function buildBalls() {
  // 기존 볼 제거 (재생성 시 중복 방지)
  ballMeshes.flat().forEach(b => b.parent?.remove(b));
  ballMeshes.length = 0;

  state.ballData.forEach((row, ri) => {
    const rowMeshes = row.map((num, ci) => {
      const ball = add(
        new THREE.SphereGeometry(0.082, 10, 10),
        toon(ballColorInt(num)),
        // 위치: 스크린 앞에 3줄 × 6개 격자로 배치
        -1.04 + ci * 0.415, // x: 왼쪽(-1.04)에서 오른쪽으로 0.415씩
        1.47 - ri * 0.49,   // y: 위(1.47)에서 아래로 0.49씩
        0.93                 // z: 스크린(0.91) 보다 살짝 앞으로
      );
      return ball;
    });
    ballMeshes.push(rowMeshes);
  });
}

// ── 볼 색상 업데이트 (스핀 중 호출) ──────────────────────────────────
// 스핀 중에는 state.ballData 가 계속 바뀌므로 Mesh 색상도 동기화
export function syncBallColors() {
  state.ballData.forEach((row, ri) => {
    row.forEach((num, ci) => {
      if (ballMeshes[ri]?.[ci]) {
        ballMeshes[ri][ci].material.color.setHex(ballColorInt(num));
      }
    });
  });
}

// ── 특정 줄 볼 "팝" 애니메이션 (스핀 정지 시 효과) ──────────────────
export function popRow(ri) {
  ballMeshes[ri]?.forEach(ball => {
    ball.scale.set(1.35, 1.35, 1.35); // 순간적으로 크게
    setTimeout(() => ball.scale.set(1, 1, 1), 180); // 0.18초 후 원복
  });
}

// ── 볼 idle 반짝임 애니메이션 (main.js 루프에서 호출) ─────────────────
export function animateBalls(t) {
  ballMeshes.flat().forEach((ball, i) => {
    // sin 함수로 부드럽게 밝기 변동 (각 볼마다 위상 다르게)
    // MeshToonMaterial은 emissive 지원 안 하므로 scale로 미묘한 변화
    const s = 1 + Math.sin(t * 1.2 + i * 0.7) * 0.02;
    ball.scale.set(s, s, s);
  });
}
