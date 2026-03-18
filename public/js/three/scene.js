/**
 * three/scene.js — Three.js의 3대 핵심: Scene, Camera, Renderer
 *                  + 조명(Lights) + OrbitControls
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  Three.js 3D 렌더링의 기본 구조                                  │
 * │                                                                  │
 * │  Scene (장면)                                                    │
 * │  ├── 3D 세계 자체. 모든 물체·빛이 여기 들어감                     │
 * │  ├── 영화 세트장 같은 개념                                        │
 * │  └── scene.add(mesh) 로 물체 추가                                │
 * │                                                                  │
 * │  Camera (카메라)                                                  │
 * │  ├── 장면을 어떤 각도/시야로 볼지 결정                             │
 * │  ├── PerspectiveCamera: 원근감 있음 (가까울수록 크게 보임)         │
 * │  └── camera.position.set(x, y, z) 로 위치 조정                   │
 * │                                                                  │
 * │  Renderer (렌더러)                                                │
 * │  ├── Scene + Camera → canvas 픽셀로 변환 (GPU 사용)              │
 * │  ├── renderer.render(scene, camera) 를 매 프레임 호출             │
 * │  └── antialias: false → 픽셀 경계 유지 (레트로 느낌)              │
 * │                                                                  │
 * │  Light (조명)                                                     │
 * │  ├── MeshToonMaterial은 빛 없어도 보이지만, 그림자엔 필요          │
 * │  ├── HemisphereLight: 하늘·땅 양방향의 부드러운 환경광             │
 * │  └── DirectionalLight: 태양처럼 평행한 강한 빛 (그림자 생성)       │
 * └─────────────────────────────────────────────────────────────────┘
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const canvas = document.getElementById('c');

// ── Renderer ──────────────────────────────────────────────────────────
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
// setPixelRatio: 화면 해상도 배율
// devicePixelRatio: Retina 등 고해상도 디스플레이 대응 (보통 1~3)
// Math.min(..., 2): 과도한 해상도 방지 (성능 균형)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
// BasicShadowMap: 그림자 가장자리가 딱딱하게 → 레트로 스타일에 어울림
renderer.shadowMap.type = THREE.BasicShadowMap;

// ── Scene ─────────────────────────────────────────────────────────────
export const scene = new THREE.Scene();
scene.background = new THREE.Color(0xede4ff); // 연보라 파스텔 배경
// Fog(안개): 먼 곳 물체가 배경색으로 서서히 사라짐 → 깊이감 표현
// Fog(색상, 시작거리, 끝거리)
scene.fog = new THREE.Fog(0xede4ff, 13, 22);

// ── Camera ────────────────────────────────────────────────────────────
export const camera = new THREE.PerspectiveCamera(
  52,                       // FOV(시야각): 클수록 어안렌즈처럼 왜곡, 52°가 자연스러움
  innerWidth / innerHeight, // 종횡비: 화면 비율에 항상 맞춰야 찌그러지지 않음
  0.1,                      // near: 이 거리보다 가까운 물체는 안 그림
  50                        // far: 이 거리보다 먼 물체는 안 그림 (fog 끝보다 크게)
);
// 카메라 초기 위치: x=오른쪽, y=위, z=앞쪽
camera.position.set(3.6, 1.6, 5.6);

// ── OrbitControls ─────────────────────────────────────────────────────
// 마우스로 카메라를 돌리고(orbit), 줌하고, 패닝할 수 있게 해주는 도우미
// canvas를 이벤트 대상으로 줘야 마우스 이벤트를 받음
export const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;    // 관성 효과: 마우스 떼도 부드럽게 멈춤
controls.dampingFactor = 0.08;    // 관성 강도 (클수록 빨리 멈춤)
controls.target.set(0, 0.2, 0);  // 카메라가 바라보는 중심점 (기계 중앙)
controls.minDistance = 3.5;
controls.maxDistance = 11;
// 주의: controls.update()를 매 프레임 호출해야 damping이 동작함 (main.js 참고)

// ── Lights ────────────────────────────────────────────────────────────
// HemisphereLight(skyColor, groundColor, intensity)
// 위에서 흰빛, 아래에서 연보라빛 → 전체적으로 부드러운 환경광
export const hemiLight = new THREE.HemisphereLight(0xffffff, 0xede4ff, 2.2);
scene.add(hemiLight);

// DirectionalLight: 특정 방향에서 오는 평행광 (태양 역할)
// castShadow: true 로 설정해야 그림자 생성
export const sunLight = new THREE.DirectionalLight(0xfff5e0, 2.8);
sunLight.position.set(4, 7, 5);  // 빛이 오는 방향 (물체 위치 아님!)
sunLight.castShadow = true;
// shadow.mapSize: 그림자 텍스처 해상도. 높을수록 선명하지만 무거움
sunLight.shadow.mapSize.set(512, 512);
scene.add(sunLight);

// 반대편 약한 채움 빛: 그림자 부분이 완전히 검어지지 않게 보완
export const fillLight = new THREE.DirectionalLight(0xd4e8ff, 0.8);
fillLight.position.set(-4, 2, -3);
scene.add(fillLight);

// ── Resize 대응 ───────────────────────────────────────────────────────
// 창 크기가 바뀌면 카메라 비율과 렌더러 크기를 맞춰줘야 찌그러지지 않음
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix(); // aspect 변경 후 반드시 호출!
  renderer.setSize(innerWidth, innerHeight);
});
