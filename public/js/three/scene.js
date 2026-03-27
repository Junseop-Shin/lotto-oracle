/**
 * three/scene.js — Three.js의 3대 핵심: Scene, Camera, Renderer
 *                  + 조명(Lights) + OrbitControls
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const canvas = document.getElementById('c');

// ── Renderer ──────────────────────────────────────────────────────────
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.BasicShadowMap;

// ── Scene ─────────────────────────────────────────────────────────────
export const scene = new THREE.Scene();
scene.background = new THREE.Color(0xede4ff);
scene.fog = new THREE.Fog(0xede4ff, 13, 22);

// ── Camera ────────────────────────────────────────────────────────────
export const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 50);

// ── OrbitControls ─────────────────────────────────────────────────────
export const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 2.5;
controls.maxDistance = 11;

// ── 캔버스 크기 계산 ───────────────────────────────────────────────────
// 모바일 세로: 기계의 자연 비율(~0.80)에 맞는 캔버스를 만들어 중앙 배치
// → 기계가 꽉 차 보이고 위아래 HUD 여백 확보
function getCanvasSize() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const portrait = vh > vw && vw < 768;

  if (portrait) {
    // 화면 높이의 72%를 캔버스로 사용 → 위아래 14%씩 HUD 여백
    // aspect ≈ 0.65 → visible_width = 7.27*0.65 = 4.7유닛 (기계 4.3 + 레버 여유)
    const w = vw;
    const h = Math.round(vh * 0.72);
    return { w, h };
  }
  return { w: vw, h: vh };
}

// ── 캔버스 위치 업데이트 (portrait에서 수직 중앙 배치) ────────────────
function updateCanvasLayout() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const portrait = vh > vw && vw < 768;
  const { w, h } = getCanvasSize();

  renderer.setSize(w, h);

  if (portrait) {
    // 캔버스를 세로 중앙에 배치 (CSS top 값으로)
    const offsetY = Math.round((vh - h) / 2);
    canvas.style.position = 'fixed';
    canvas.style.top = offsetY + 'px';
    canvas.style.left = '0';
  } else {
    canvas.style.position = '';
    canvas.style.top = '';
    canvas.style.left = '';
  }
}

// ── 반응형 카메라 + 캔버스 ────────────────────────────────────────────
export function setResponsiveCamera() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const portrait = vh > vw;
  const { w, h } = getCanvasSize();

  camera.aspect = w / h;

  if (vw < 768 && portrait) {
    // 모바일 세로: z=7.5로 앞으로, target y=0.15로 기계 수직 중앙 맞춤
    // visible_height=7.78, 기계 5.65 = 73% (꽉 차 보임)
    // 기계 세계좌표 중심 = machineGroup.y(1.4) + 기계 로컬 중심(0.15) = 1.55
    // 카메라는 아래에 두고 target만 기계 중심을 향하게
    camera.position.set(0.3, 0.15, 7.5);
    controls.target.set(0.3, 1.55, 0);
    camera.fov = 55;
  } else if (vw < 768) {
    // 모바일 가로
    camera.position.set(2.0, 1.2, 6.5);
    controls.target.set(0, 0.3, 0);
    camera.fov = 52;
  } else if (vw < 1024) {
    // 태블릿
    camera.position.set(3.0, 1.4, 5.2);
    controls.target.set(0, 0.3, 0);
    camera.fov = 52;
  } else {
    // 데스크탑
    camera.position.set(3.6, 1.6, 5.6);
    controls.target.set(0, 0.2, 0);
    camera.fov = 52;
  }

  camera.updateProjectionMatrix();
  controls.update();
}

// 초기 설정
updateCanvasLayout();
setResponsiveCamera();

// ── Lights ────────────────────────────────────────────────────────────
export const hemiLight = new THREE.HemisphereLight(0xffffff, 0xede4ff, 2.2);
scene.add(hemiLight);

export const sunLight = new THREE.DirectionalLight(0xfff5e0, 2.8);
sunLight.position.set(4, 7, 5);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(512, 512);
scene.add(sunLight);

export const fillLight = new THREE.DirectionalLight(0xd4e8ff, 0.8);
fillLight.position.set(-4, 2, -3);
scene.add(fillLight);

// ── Resize 대응 ───────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  updateCanvasLayout();
  setResponsiveCamera();
});
