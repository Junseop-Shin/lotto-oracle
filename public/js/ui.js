/**
 * ui.js — HUD(Head-Up Display) 텍스트 UI 관리
 *
 * Three.js는 3D 캔버스만 담당해요.
 * 텍스트(크레딧 숫자, 메시지, 알고리즘 태그)는 HTML 요소를 canvas 위에
 * CSS로 overlay해서 표시하는 게 훨씬 깔끔하고 빠릅니다.
 * 3D로 텍스트를 만들려면 폰트 로딩, TextGeometry 등 복잡한 과정이 필요해요.
 */

import { state, TAG_COLORS } from './state.js';

// HTML 요소들을 미리 가져와 변수에 저장 (매번 querySelector 하면 느림)
const creditEl   = document.getElementById('cnum');
const msgEl      = document.getElementById('msg-box');
const algoHintEl = document.getElementById('algo-hint');
const dataStatEl = document.getElementById('data-status');

let msgTimer = null; // 메시지 자동 복귀용 타이머 ID

// ── 크레딧 표시 업데이트 ──────────────────────────────────────────────
export function updateCredit() {
  creditEl.textContent = state.credits;
}

// ── 상단 메시지 표시 (dur ms 후 기본 메시지로 자동 복귀) ─────────────
export function showMsg(text, dur = 2500) {
  msgEl.textContent = text;
  if (msgTimer) clearTimeout(msgTimer); // 이전 타이머 취소
  if (dur < 90000) {
    msgTimer = setTimeout(() => {
      msgEl.textContent = '알고리즘 선택 후 레버를 당기세요!';
    }, dur);
  }
}

// ── 하단 알고리즘 태그 렌더 ──────────────────────────────────────────
// state.algoTags 배열을 읽어서 DOM을 다시 그려요
export function renderAlgoHint() {
  algoHintEl.innerHTML = state.algoTags
    .map((t, i) => `<div class="atag" style="background:${TAG_COLORS[i]}">${t}</div>`)
    .join('');
}

// ── 데이터 최신화 상태 표시 (우하단 작은 텍스트) ─────────────────────
export function updateDataStatus(text) {
  if (dataStatEl) dataStatEl.textContent = text;
}
