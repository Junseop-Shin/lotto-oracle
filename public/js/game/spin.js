/**
 * game/spin.js — 슬롯머신 스핀 오케스트레이터
 *
 * 스핀 흐름:
 *  1. 레버 클릭 → lever.js 에서 doSpin() 호출
 *  2. API로 최종 번호 가져오기 (병렬로 릴 애니메이션 시작)
 *  3. screen.js 의 startSpin() 이 릴 애니메이션 + 순차 정지 처리
 *  4. 모든 릴 정지 → onDone 콜백 → 완료 메시지 + 징글
 */

import { state, ALGOS } from '../state.js';
import { showMsg } from '../ui.js';
import { startSpin } from '../three/screen.js';
import { fetchGenerate } from '../api.js';
import { playComplete } from '../audio.js';

// ── 랜덤 번호 생성 (로컬 폴백) ──────────────────────────────────────
function randNums() {
  const s = new Set();
  while (s.size < 6) s.add(Math.floor(Math.random() * 45) + 1);
  return [...s].sort((a, b) => a - b);
}

// ── 메인 스핀 함수 ────────────────────────────────────────────────────
export async function doSpin() {
  if (state.spinning) return;
  state.spinning = true;
  showMsg('SPINNING...', 99999);

  // 선택된 알고리즘 기준으로 API 호출 (없으면 랜덤)
  const methods = state.selected.size > 0
    ? [...state.selected].map(i => ALGOS[i].id)
    : ['random'];

  const [finalSets] = await Promise.all([
    fetchGenerate(methods),
    new Promise(r => setTimeout(r, 0)),
  ]);

  // 3줄 분량 번호 정리 (부족하면 랜덤으로 채움)
  const finalData = [0, 1, 2].map(i => {
    const set = finalSets[i];
    return set ? [...set.numbers].sort((a, b) => a - b) : randNums();
  });

  // screen.js 릴 애니메이션 시작 + 완료 콜백
  startSpin(finalData, () => {
    state.spinning = false;
    showMsg('번호 생성 완료! 코인을 넣고 다시 도전하세요 :)', 4000);
    playComplete();
  });
}
