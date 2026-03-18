/**
 * api.js — 서버 API 통신 + 자동 데이터 최신화
 *
 * 로또 당첨 번호는 매주 토요일에 발표돼요.
 * 페이지 로드 시 DB의 마지막 업데이트 시각을 확인하고,
 * 6시간 이상 지났으면 서버에서 자동으로 최신 데이터를 가져옵니다.
 * 사용자가 버튼을 누를 필요 없어요!
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

// ── 목(mock) 데이터 — 서버 없이 로컬 개발할 때 사용 ──────────────────
function mockStats() {
  return { total: 1127, latest: 1127, updatedAt: new Date().toISOString(), cacheAge: 0 };
}

function mockNumbers() {
  const s = new Set();
  while (s.size < 6) s.add(Math.floor(Math.random() * 45) + 1);
  return [...s].sort((a, b) => a - b);
}

// ── 통계 조회 ──────────────────────────────────────────────────────────
export async function fetchStats() {
  try {
    const data = await apiFetch('/api/stats');
    state.stats = data;
    return data;
  } catch {
    console.warn('[API] /api/stats 실패 → 목 데이터 사용');
    return mockStats();
  }
}

// ── 서버에 데이터 fetch 요청 (최신 회차 가져오기) ────────────────────
async function triggerFetch() {
  try {
    await fetch('/api/fetch?mode=latest', { method: 'POST' });
    console.log('[API] 최신 데이터 fetch 완료');
  } catch {
    console.warn('[API] fetch 요청 실패 (서버 미응답)');
  }
}

// ── 자동 최신화 — 페이지 로드 시 딱 한 번 호출 ────────────────────────
//
// 흐름:
//  1. /api/stats 로 마지막 업데이트 시각 확인
//  2. 6시간 이상 지났으면 /api/fetch 로 서버에 크롤링 요청
//  3. 완료 후 stats 다시 조회해서 state 갱신
export async function autoRefresh() {
  updateDataStatus('⏳ 데이터 확인 중...');

  const stats = await fetchStats();
  const updatedAt = stats.updatedAt ? new Date(stats.updatedAt) : null;
  const hoursSince = updatedAt
    ? (Date.now() - updatedAt.getTime()) / 1000 / 3600
    : 999;

  if (hoursSince > 6) {
    updateDataStatus('🔄 최신 데이터 가져오는 중...');
    await triggerFetch();
    const fresh = await fetchStats();
    state.stats = fresh;
    updateDataStatus(`✅ ${fresh.latest}회차`);
    showMsg(`데이터 자동 갱신 완료! (${fresh.latest}회차)`, 3000);
  } else {
    updateDataStatus(`✅ ${stats.latest}회차`);
  }
}

// ── 번호 생성 요청 ────────────────────────────────────────────────────
export async function fetchGenerate(methods) {
  try {
    const data = await apiFetch('/api/generate', {
      method: 'POST',
      body: JSON.stringify({ methods, count_per_method: 1 }),
    });
    return data.sets ?? data;
  } catch {
    console.warn('[API] /api/generate 실패 → 목 데이터 사용');
    return methods.map(method => ({
      method,
      numbers: mockNumbers(),
      score: (Math.random() * 0.4 + 0.6).toFixed(3),
    }));
  }
}
