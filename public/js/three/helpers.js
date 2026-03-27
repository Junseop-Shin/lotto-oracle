/**
 * three/helpers.js — 자주 쓰는 Material·Geometry 헬퍼 + 셀 쉐이딩 설정
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  Material (재질) — 물체 표면이 어떻게 보일지 결정                 │
 * │                                                                  │
 * │  MeshToonMaterial  → 만화/셀 애니메이션 스타일 (이 앱에서 사용)  │
 * │  MeshStandardMaterial → 현실적 PBR (금속성, 거칠기 표현)         │
 * │  MeshBasicMaterial → 빛 영향 없음 (항상 동일한 색)               │
 * │                                                                  │
 * │  gradientMap: 빛을 몇 단계로 표현할지 결정하는 텍스처             │
 * │    - 없으면 2단계 (밝음/어두움)                                   │
 * │    - 3×1 픽셀 텍스처 → 3단계 (밝음/중간/어두움) = 레트로 느낌   │
 * │    - NearestFilter: 픽셀 경계 보간 안 함 → 딱딱한 경계선 유지    │
 * │                                                                  │
 * │  Geometry (형태) — 물체의 3D 모양(정점·면) 정의                  │
 * │                                                                  │
 * │  BoxGeometry(w,h,d)           → 직육면체                        │
 * │  SphereGeometry(r,wSeg,hSeg)  → 구 (세그먼트 많을수록 부드러움) │
 * │  CylinderGeometry(rT,rB,h,s)  → 원기둥                         │
 * │  TorusGeometry(r,tube,rS,tS)  → 도넛                           │
 * │  RoundedBoxGeometry(w,h,d,s,r)→ 모서리 둥근 직육면체            │
 * │                                                                  │
 * │  Mesh = Geometry + Material → 실제로 scene.add() 하는 3D 물체   │
 * └─────────────────────────────────────────────────────────────────┘
 */

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { scene } from './scene.js';

// 기계 전체를 담는 그룹 — position.y 조정으로 기계 전체를 올리거나 내릴 수 있음
export const machineGroup = new THREE.Group();
scene.add(machineGroup);

// ── Gradient Map (셀 쉐이딩 3단계) ───────────────────────────────────
// 1×3 픽셀짜리 텍스처를 직접 만들어요:
//   픽셀0 = 흰색 (밝은 면)
//   픽셀1 = 회색 (중간 면)
//   픽셀2 = 진한 회색 (그림자 면)
// Three.js가 이 텍스처를 보고 빛 단계를 결정해요
export const gradMap = (() => {
  const c = document.createElement('canvas');
  c.width = 3; c.height = 1;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 1, 1); // 밝은 면
  ctx.fillStyle = '#ddd'; ctx.fillRect(1, 0, 1, 1); // 중간 면
  ctx.fillStyle = '#aaa'; ctx.fillRect(2, 0, 1, 1); // 어두운 면

  const tex = new THREE.CanvasTexture(c);
  // NearestFilter: 경계를 블러 없이 딱딱하게 유지 → 셀 쉐이딩 핵심!
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  return tex;
})();

// ── toon(color, extra?) ───────────────────────────────────────────────
// MeshToonMaterial을 한 줄로 만드는 헬퍼
// extra: 추가 옵션 (ex: { side: THREE.DoubleSide })
export const toon = (color, extra = {}) =>
  new THREE.MeshToonMaterial({ color, gradientMap: gradMap, ...extra });

// ── rbox(w, h, d, radius, segments) ──────────────────────────────────
// 모서리 둥근 박스 Geometry 헬퍼
// radius: 모서리 둥글기 (0=직각, 0.3=많이 둥글)
// segments: 둥근 부분 분할 수 (3이면 충분, 높으면 폴리곤 수 증가)
export const rbox = (w, h, d, r = 0.15, s = 3) =>
  new RoundedBoxGeometry(w, h, d, s, r);

// ── add(geo, mat, x, y, z, shadow?) ──────────────────────────────────
// Mesh 생성 → 위치 설정 → scene 추가를 한 줄로
// shadow: true 이면 castShadow + receiveShadow 둘 다 켬
export function add(geo, mat, x = 0, y = 0, z = 0, shadow = false) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  if (shadow) {
    mesh.castShadow    = true; // 이 물체가 다른 물체에 그림자를 드리움
    mesh.receiveShadow = true; // 이 물체가 그림자를 받음
  }
  machineGroup.add(mesh);
  return mesh;
}
