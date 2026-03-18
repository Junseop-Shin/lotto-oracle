/**
 * audio.js — Web Audio API 기반 효과음 합성
 *
 * 외부 .mp3/.wav 파일 없이 코드로 소리를 직접 만들어요.
 *
 * ── Web Audio API 핵심 개념 ────────────────────────────────────────────
 *
 *  AudioContext
 *  ├── 모든 오디오 처리의 중심 (브라우저 사운드 엔진)
 *  └── 노드(node)들을 연결해서 소리를 만들고 처리해요
 *
 *  노드 종류:
 *  ├── OscillatorNode  — 주파수(Hz)로 사인/사각/삼각파 생성 (음정)
 *  ├── AudioBufferSource — 직접 만든 파형 데이터 재생 (노이즈 등)
 *  ├── GainNode        — 볼륨 제어 (0=무음, 1=원본)
 *  └── BiquadFilterNode — 특정 주파수 대역 강조/제거 (이퀄라이저)
 *
 *  연결 패턴:
 *  source → [filter →] gain → ctx.destination(스피커)
 *
 *  Envelope (소리 포락선):
 *  ├── Attack:  소리가 시작해서 최대 볼륨까지 올라가는 시간
 *  ├── Decay:   최대에서 서스테인 레벨로 내려가는 시간
 *  ├── Sustain: 키를 누르고 있는 동안 유지되는 볼륨
 *  └── Release: 키를 떼고 소리가 사라지는 시간
 *  → 간단한 효과음은 Attack + Release (AD envelope)만 써요
 *
 *  브라우저 정책:
 *  - 사용자 인터랙션(클릭) 없이 AudioContext를 시작할 수 없어요
 *  - suspended 상태이면 resume() 호출 필요 → resume() 헬퍼 함수 사용
 */

// AudioContext: 싱글톤 (한 페이지에 하나만 만드는 게 좋음)
// webkitAudioContext: 구형 Safari 대응
const actx = new (window.AudioContext || window.webkitAudioContext)();

// ── 공통 헬퍼 ─────────────────────────────────────────────────────────
// 클릭 등 사용자 인터랙션 후 suspended 상태 해제
function resume() {
  if (actx.state === 'suspended') actx.resume();
}

// 단순 발진기(oscillator) 생성 헬퍼
// type: 'sine'|'square'|'triangle'|'sawtooth'
// freq: 주파수 Hz, vol: 초기 볼륨, dur: 지속 시간(초)
function osc(type, freq, vol, dur, t = actx.currentTime) {
  const o = actx.createOscillator();
  const g = actx.createGain();
  o.connect(g);
  g.connect(actx.destination);
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.start(t);
  o.stop(t + dur + 0.01);
  return { o, g };
}

// 노이즈 버스트 생성 헬퍼
// dur: 버퍼 길이(초), lpFreq: 로우패스 컷오프 Hz, vol: 볼륨, decay: 감쇠 속도
function noise(dur, lpFreq, vol, decay, t = actx.currentTime) {
  const len    = Math.ceil(actx.sampleRate * dur);
  const buf    = actx.createBuffer(1, len, actx.sampleRate);
  const data   = buf.getChannelData(0);
  // 랜덤 파형 (화이트 노이즈) + 지수 감쇠 적용
  for (let i = 0; i < len; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * decay));
  }

  const src    = actx.createBufferSource();
  src.buffer   = buf;

  const filter = actx.createBiquadFilter();
  filter.type  = 'lowpass';
  filter.frequency.value = lpFreq;

  const g = actx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  src.connect(filter);
  filter.connect(g);
  g.connect(actx.destination);
  src.start(t);
  return src;
}

// ── 코인 투입음 ────────────────────────────────────────────────────────
// 슬롯머신 코인 트레이에 동전이 떨어져 쌓이는 소리:
//   1차 충격 → 짧은 금속 링 → 1,2번 바운스 → 구르다 안착
export function playCoin() {
  resume();
  const t = actx.currentTime;

  // ① 1차 충격: 날카로운 고주파 노이즈 (동전이 트레이에 첫 충돌)
  noise(0.06, 9000, 0.9, 0.08, t);

  // ② 금속 링(ring): 충격 직후 울리는 금속음
  //    4000Hz → 1200Hz 로 빠르게 내려가며 사라짐
  const { o: ring } = osc('triangle', 4000, 0.28, 0.3, t + 0.01);
  ring.frequency.exponentialRampToValueAtTime(1200, t + 0.28);

  // ③ 1차 바운스 (0.11초 후): 첫 충격보다 작게
  noise(0.04, 7000, 0.5, 0.1, t + 0.11);
  const { o: b1 } = osc('triangle', 2800, 0.12, 0.15, t + 0.11);
  b1.frequency.exponentialRampToValueAtTime(900, t + 0.23);

  // ④ 2차 바운스 (0.19초 후): 더 작고 짧게
  noise(0.03, 5500, 0.28, 0.12, t + 0.19);

  // ⑤ 구름 + 안착 (0.26초~): 점점 작아지는 중주파 노이즈
  noise(0.18, 3500, 0.18, 0.6, t + 0.26);
}

// ── 버튼 토글음 ────────────────────────────────────────────────────────
// isOn=true: 누르는 소리 (낮고 둔탁), false: 떼는 소리 (높고 짧게)
export function playButton(isOn) {
  resume();
  const t = actx.currentTime;
  if (isOn) {
    noise(0.035, 900, 0.45, 0.12, t);
    osc('sine', 380, 0.12, 0.09, t);
  } else {
    noise(0.03, 1400, 0.3, 0.15, t);
    osc('sine', 520, 0.08, 0.07, t);
  }
}

// ── 레버 당기는 소리 ──────────────────────────────────────────────────
// 묵직한 기계음: 저주파 노이즈(덜컥) + 살짝 뒤의 클릭음
export function playLever() {
  resume();
  const t = actx.currentTime;

  // 덜컥 소리 (레버 잠금 해제)
  noise(0.12, 180, 0.7, 0.15, t);

  // 0.05초 뒤: 레버가 홈을 타고 내려가는 마찰음
  noise(0.25, 400, 0.25, 0.5, t + 0.05);

  // 0.38초 뒤(복귀 시점): 레버 복귀 클릭
  noise(0.08, 220, 0.5, 0.2, t + 0.38);
}

// ── 슬롯 스핀 소리 ────────────────────────────────────────────────────
// 릴이 돌아가는 라체트(ratchet) 클릭 사운드
// setInterval로 주기적 클릭 → 스핀 진행 중에 반복

let spinClickId = null; // 인터벌 ID (null = 스핀 중 아님)
let spinSpeed   = 55;   // 클릭 간격 ms (낮을수록 빠름)

export function startSpinAudio() {
  resume();
  stopSpinAudio(); // 혹시 이전 거 남아있으면 정리

  spinSpeed = 55;

  function click() {
    if (!spinClickId) return;
    const t = actx.currentTime;
    // 짧고 높은 클릭음 (릴 톱니 넘어가는 느낌)
    noise(0.025, 2200, 0.18, 0.15, t);
    // 클릭 간격을 점점 느리게 (감속 릴 효과)
    spinSpeed = Math.min(spinSpeed * 1.012, 220);
    spinClickId = setTimeout(click, spinSpeed);
  }

  spinClickId = setTimeout(click, spinSpeed);
}

export function stopSpinAudio() {
  if (spinClickId) {
    clearTimeout(spinClickId);
    spinClickId = null;
  }
}

// ── 릴 한 줄 정지음 ───────────────────────────────────────────────────
// 각 열이 멈출 때 '찰깍' 소리
export function playReelStop() {
  resume();
  const t = actx.currentTime;
  noise(0.07, 600, 0.55, 0.2, t);
  osc('square', 220, 0.12, 0.08, t);
}

// ── 완료 징글 ─────────────────────────────────────────────────────────
// 오름차순 화음 (C5→E5→G5→C6) — 밝고 경쾌한 승리 효과음
export function playComplete() {
  resume();
  const notes = [523, 659, 784, 1047]; // C5, E5, G5, C6 (Hz)

  notes.forEach((freq, i) => {
    const t = actx.currentTime + i * 0.13;

    // 주음 (사인파 — 맑고 깨끗한 음색)
    osc('sine', freq, 0.28, 0.42, t);

    // 살짝 높은 배음 (풍성함 추가)
    osc('sine', freq * 2, 0.08, 0.35, t + 0.01);
  });

  // 마지막 음 이후 짧은 스파클 노이즈 (반짝이는 느낌)
  noise(0.12, 8000, 0.15, 0.3, actx.currentTime + notes.length * 0.13);
}
