/**
 * state.js — 앱 전체에서 공유하는 상태 객체
 *
 * 왜 한 파일에 모나요?
 * - 여러 파일이 같은 데이터를 읽고 써야 할 때, 각자 변수를 가지면
 *   파일 A가 credits를 바꿔도 파일 B는 모르는 문제가 생겨요.
 * - 하나의 state 객체를 모두가 import해서 직접 수정하면
 *   항상 최신 값을 볼 수 있어요. (JavaScript 객체는 참조로 전달됨)
 */

// ── 변하는 상태 (런타임 중 바뀜) ──────────────────────────────────────
export const state = {
  credits:  3,           // 현재 보유 크레딧
  selected: new Set(),   // 선택된 버튼 인덱스들 (Set = 중복 없는 집합)
  spinning: false,       // 슬롯 스핀 중 여부
  ballData: [            // 화면에 표시 중인 볼 번호 (3줄 × 6개)
    [ 7, 15, 23, 31, 38, 42],
    [ 3, 18, 22, 29, 34, 45],
    [11, 20, 27, 33, 37, 43],
  ],
  algoTags: ['RANDOM', 'RANDOM', 'RANDOM'], // 각 줄 알고리즘 태그 (버튼 선택 전 기본값)
  stats: null,           // 서버에서 받아온 통계
};

// ── 변하지 않는 설정 (const) ───────────────────────────────────────────
export const MAX_SELECT = 3;

export const ALGOS = [
  { id: 'apriori',     label: 'Apriori', colorOff: 0xffb3a7, colorOn: 0xff6b6b },
  { id: 'conditional', label: 'Cond.',   colorOff: 0xaacfff, colorOn: 0x4d8fff },
  { id: 'markov',      label: 'Markov',  colorOff: 0xa7f5ce, colorOn: 0x2dcc70 },
  { id: 'ensemble',    label: 'Ensem.',  colorOff: 0xd4b3ff, colorOn: 0x9b59b6 },
  { id: 'random',      label: 'Random',  colorOff: 0xfff3a7, colorOn: 0xf1c40f },
];

// 태그 3개 각각의 CSS 색상 (CRT 화면 우측 라벨용)
export const TAG_COLORS = ['#ffb3a7', '#a7f5ce', '#d4b3ff'];

// ── 볼 번호 → 색상 변환 헬퍼 ─────────────────────────────────────────
// Three.js는 색상을 0xRRGGBB 정수로 받아요 (HTML #rrggbb 와 같은 값)
export const ballColorInt = n =>
  n <= 10 ? 0xfbbf24 : n <= 20 ? 0x60a5fa : n <= 30 ? 0xf87171 : n <= 40 ? 0x9ca3af : 0x4ade80;

// Canvas 2D API는 CSS 문자열 '#rrggbb' 형식을 사용해요
export const ballColorCSS = n =>
  n <= 10 ? '#fbbf24' : n <= 20 ? '#60a5fa' : n <= 30 ? '#f87171' : n <= 40 ? '#9ca3af' : '#4ade80';
