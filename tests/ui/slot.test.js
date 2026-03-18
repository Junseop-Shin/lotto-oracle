/**
 * UI module tests — state.js + api.js
 *
 * state.js: pure exports (no DOM), testable directly.
 * api.js:   mocks fetch + ui.js (ui.js has DOM side-effects at import time).
 *
 * Run: cd tests/ui && npm test
 */

import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock ui.js before importing api.js  (ui.js calls getElementById at top level)
// ---------------------------------------------------------------------------
vi.mock("../../public/js/ui.js", () => ({
  showMsg: vi.fn(),
  updateDataStatus: vi.fn(),
  renderAlgoHint: vi.fn(),
  updateCredit: vi.fn(),
}));

// ---------------------------------------------------------------------------
// state.js — pure exports
// ---------------------------------------------------------------------------

import {
  state,
  MAX_SELECT,
  ALGOS,
  TAG_COLORS,
  ballColorInt,
  ballColorCSS,
} from "../../public/js/state.js";

describe("state — initial values", () => {
  it("credits starts at 3", () => {
    expect(state.credits).toBe(3);
  });

  it("spinning starts false", () => {
    expect(state.spinning).toBe(false);
  });

  it("selected starts as empty Set", () => {
    expect(state.selected instanceof Set).toBe(true);
    expect(state.selected.size).toBe(0);
  });

  it("ballData has 3 rows of 6 numbers each", () => {
    expect(state.ballData).toHaveLength(3);
    state.ballData.forEach((row) => {
      expect(row).toHaveLength(6);
      row.forEach((n) => {
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(45);
      });
    });
  });

  it("algoTags defaults to 3 RANDOM entries", () => {
    expect(state.algoTags).toHaveLength(3);
    state.algoTags.forEach((t) => expect(t).toBe("RANDOM"));
  });
});

describe("MAX_SELECT", () => {
  it("is 3", () => {
    expect(MAX_SELECT).toBe(3);
  });
});

describe("ALGOS", () => {
  it("has all 5 algorithms", () => {
    expect(ALGOS).toHaveLength(5);
    const ids = ALGOS.map((a) => a.id);
    expect(ids).toContain("apriori");
    expect(ids).toContain("conditional");
    expect(ids).toContain("markov");
    expect(ids).toContain("ensemble");
    expect(ids).toContain("random");
  });

  it("each algo has id, label, colorOff, colorOn", () => {
    ALGOS.forEach((a) => {
      expect(typeof a.id).toBe("string");
      expect(typeof a.label).toBe("string");
      expect(typeof a.colorOff).toBe("number");
      expect(typeof a.colorOn).toBe("number");
    });
  });
});

describe("TAG_COLORS", () => {
  it("has 3 CSS color strings", () => {
    expect(TAG_COLORS).toHaveLength(3);
    TAG_COLORS.forEach((c) => expect(c).toMatch(/^#[0-9a-f]{6}$/i));
  });
});

describe("ballColorInt", () => {
  it("1-10 → yellow (0xfbbf24)", () => {
    expect(ballColorInt(1)).toBe(0xfbbf24);
    expect(ballColorInt(10)).toBe(0xfbbf24);
  });
  it("11-20 → blue (0x60a5fa)", () => {
    expect(ballColorInt(11)).toBe(0x60a5fa);
    expect(ballColorInt(20)).toBe(0x60a5fa);
  });
  it("21-30 → red (0xf87171)", () => {
    expect(ballColorInt(21)).toBe(0xf87171);
    expect(ballColorInt(30)).toBe(0xf87171);
  });
  it("31-40 → gray (0x9ca3af)", () => {
    expect(ballColorInt(31)).toBe(0x9ca3af);
    expect(ballColorInt(40)).toBe(0x9ca3af);
  });
  it("41-45 → green (0x4ade80)", () => {
    expect(ballColorInt(41)).toBe(0x4ade80);
    expect(ballColorInt(45)).toBe(0x4ade80);
  });
});

describe("ballColorCSS", () => {
  it("1-10 → '#fbbf24'", () => {
    expect(ballColorCSS(1)).toBe("#fbbf24");
    expect(ballColorCSS(10)).toBe("#fbbf24");
  });
  it("11-20 → '#60a5fa'", () => {
    expect(ballColorCSS(15)).toBe("#60a5fa");
  });
  it("21-30 → '#f87171'", () => {
    expect(ballColorCSS(25)).toBe("#f87171");
  });
  it("31-40 → '#9ca3af'", () => {
    expect(ballColorCSS(35)).toBe("#9ca3af");
  });
  it("41-45 → '#4ade80'", () => {
    expect(ballColorCSS(42)).toBe("#4ade80");
  });
});

// ---------------------------------------------------------------------------
// api.js — fetch helpers with mocked global fetch
// ---------------------------------------------------------------------------

import { fetchStats, fetchGenerate } from "../../public/js/api.js";

describe("fetchStats", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls /api/stats and returns data", async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ total: 1215, latest_draw_no: 1215 }),
    });
    const result = await fetchStats();
    expect(fetch).toHaveBeenCalledWith("/api/stats", expect.any(Object));
    expect(result.total).toBe(1215);
    expect(result.latest_draw_no).toBe(1215);
  });

  it("returns zeros on network failure", async () => {
    fetch.mockRejectedValueOnce(new Error("network error"));
    const result = await fetchStats();
    expect(result).toEqual({ total: 0, latest_draw_no: 0 });
  });

  it("returns zeros on non-ok response", async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 500 });
    const result = await fetchStats();
    expect(result).toEqual({ total: 0, latest_draw_no: 0 });
  });
});

describe("fetchGenerate", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs to /api/generate with methods in body", async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve([
          { method: "apriori", numbers: [1, 5, 10, 20, 33, 44], score: 42 },
        ]),
    });
    await fetchGenerate(["apriori"]);
    expect(fetch).toHaveBeenCalledWith(
      "/api/generate",
      expect.objectContaining({ method: "POST" })
    );
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.methods).toEqual(["apriori"]);
  });

  it("returns array from server response", async () => {
    const mockData = [
      { method: "markov", numbers: [2, 8, 15, 22, 37, 41], score: 0.9 },
    ];
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockData),
    });
    const result = await fetchGenerate(["markov"]);
    expect(result).toHaveLength(1);
    expect(result[0].method).toBe("markov");
  });

  it("falls back to local random on server error", async () => {
    fetch.mockRejectedValueOnce(new Error("server down"));
    const result = await fetchGenerate(["apriori"]);
    expect(result).toHaveLength(1);
    expect(result[0].numbers).toHaveLength(6);
    expect(result[0].numbers.every((n) => n >= 1 && n <= 45)).toBe(true);
  });

  it("fallback numbers have no duplicates", async () => {
    fetch.mockRejectedValueOnce(new Error("err"));
    const result = await fetchGenerate(["random"]);
    const nums = result[0].numbers;
    expect(new Set(nums).size).toBe(6);
  });
});
