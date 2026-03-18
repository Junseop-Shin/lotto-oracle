/**
 * api.js — 서버 API 통신 + 자동 데이터 최신화
 *
 * 로또 당첨 번호는 매주 토요일에 발표돼요.
 * 페이지 로드 시 /api/fetch?mode=latest 를 호출해 최신 회차를 확인합니다.
 * 백엔드가 새 회차를 추가하면 알고리즘 예측도 자동으로 재계산돼요.
 */

import { state } from './state.js';
import { showMsg, updateDataStatus } from './ui.js';

// ── 공통 fetch 헬퍼 ────────────────────────────────────────────────────
async function apiFetch(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`);
  return res.json();
}

// ── 통계 조회 ──────────────────────────────────────────────────────────
export async function fetchStats() {
  try {
    const data = await apiFetch('/api/stats');
    // 백엔드 응답: { total, latest_draw_no }
    state.stats = data;
    return data;
  } catch (e) {
    console.warn('[API] /api/stats 실패:', e.message);
    return { total: 0, latest_draw_no: 0 };
  }
}

// ── 자동 최신화 — 페이지 로드 시 딱 한 번 호출 ────────────────────────
// 항상 /api/fetch?mode=latest 를 호출해 신규 회차 여부를 확인
// (백엔드에서 신규 없으면 fetched:0 반환하고 예측 재계산 안 함 → 빠름)
export async function autoRefresh() {
  updateDataStatus('⏳ 데이터 확인 중...');

  try {
    await apiFetch('/api/fetch?mode=latest', { method: 'POST' });
  } catch (e) {
    console.warn('[API] /api/fetch 실패:', e.message);
  }

  const stats = await fetchStats();
  if (stats.latest_draw_no > 0) {
    updateDataStatus(`✅ ${stats.latest_draw_no}회차`);
  } else {
    updateDataStatus('⚠️ 서버 연결 확인 필요');
  }
}

// ── 번호 생성 요청 ────────────────────────────────────────────────────
// 백엔드 /api/generate 는 predictions 테이블을 조회 (실시간 계산 없음)
export async function fetchGenerate(methods) {
  try {
    const data = await apiFetch('/api/generate', {
      method: 'POST',
      body: JSON.stringify({ methods, count_per_method: 1 }),
    });
    // 백엔드 응답은 [{ method, numbers, score, draw_no }, ...] 배열
    return Array.isArray(data) ? data : (data.sets ?? []);
  } catch (e) {
    console.warn('[API] /api/generate 실패:', e.message);
    // 폴백: 로컬 랜덤 (서버 장애 시에만)
    return methods.map(method => ({
      method,
      numbers: (() => {
        const s = new Set();
        while (s.size < 6) s.add(Math.floor(Math.random() * 45) + 1);
        return [...s].sort((a, b) => a - b);
      })(),
      score: 0,
    }));
  }
}
