/**
 * three/interactions.js — 레이캐스터(Raycaster): 3D 클릭 감지
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  Raycaster 란?                                                   │
 * │                                                                  │
 * │  마우스는 2D(x, y) 좌표지만, 3D 세계에서 클릭을 감지하려면       │
 * │  카메라에서 마우스 방향으로 "광선(ray)"을 쏴서                    │
 * │  그 광선이 어떤 3D 물체와 교차하는지 확인해야 해요.               │
 * │                                                                  │
 * │  마우스 클릭 → 2D 좌표 → 정규화(-1~1) → ray 생성 → 교차 검사   │
 * │                                                                  │
 * │  mouse.x, mouse.y: Three.js는 -1~1 범위를 사용해요               │
 * │  (웹 좌표 0~width 를 변환해야 함)                                │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * 다른 모듈(buttons, lever, coin)이 register()로 클릭 핸들러를 등록하고,
 * 실제 이벤트 리스너는 이 파일에서 한 곳에서만 관리해요.
 */

import * as THREE from 'three';
import { camera } from './scene.js';

const raycaster  = new THREE.Raycaster();
const mouseNDC   = new THREE.Vector2(); // NDC = Normalized Device Coordinates (-1~1)
const clickables = [];                  // { mesh, fn } 배열

let mouseDownPos = { x: 0, y: 0 };     // 드래그와 클릭 구별용

// ── 클릭 핸들러 등록 ─────────────────────────────────────────────────
// 다른 모듈에서 호출: register(mesh, () => { 할 동작 })
export function register(mesh, fn) {
  clickables.push({ mesh, fn });
}

// ── 마우스 좌표 → NDC 변환 ───────────────────────────────────────────
// Three.js Raycaster는 -1~1 범위의 좌표를 사용
// x: 왼쪽 -1, 오른쪽 +1
// y: 위 +1, 아래 -1 (웹과 반대!)
function toNDC(e, canvas) {
  const rect = canvas.getBoundingClientRect();
  mouseNDC.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
  mouseNDC.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
}

// ── 이벤트 리스너 등록 ───────────────────────────────────────────────
export function setupInteractions(canvas) {
  // 마우스 누른 위치 기록 (드래그 감지용)
  canvas.addEventListener('mousedown', e => {
    mouseDownPos = { x: e.clientX, y: e.clientY };
  });

  // 클릭: 드래그 거리가 5px 이하일 때만 클릭으로 판정
  // OrbitControls 드래그 중에 클릭이 발생하는 오작동 방지
  canvas.addEventListener('click', e => {
    const dx = e.clientX - mouseDownPos.x;
    const dy = e.clientY - mouseDownPos.y;
    if (dx * dx + dy * dy > 25) return; // 5px 이상 움직이면 드래그

    toNDC(e, canvas);

    // Raycaster 설정: 카메라에서 마우스 방향으로 광선 생성
    raycaster.setFromCamera(mouseNDC, camera);

    // 등록된 모든 mesh 에 대해 교차 검사
    const meshes = clickables.map(c => c.mesh);
    const hits   = raycaster.intersectObjects(meshes, false);
    // hits[0]: 카메라에서 가장 가까운 교차 물체

    if (hits.length > 0) {
      const hitMesh = hits[0].object;
      const entry   = clickables.find(c => c.mesh === hitMesh);
      if (entry) entry.fn(); // 등록된 핸들러 실행
    }
  });

  // 마우스 이동: 클릭 가능한 물체 위에 있으면 pointer 커서
  canvas.addEventListener('mousemove', e => {
    toNDC(e, canvas);
    raycaster.setFromCamera(mouseNDC, camera);
    const hits = raycaster.intersectObjects(clickables.map(c => c.mesh), false);
    canvas.style.cursor = hits.length > 0 ? 'pointer' : 'default';
  });
}
