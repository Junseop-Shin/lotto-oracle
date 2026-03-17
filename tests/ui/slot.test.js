/**
 * Vitest + @testing-library/dom tests for slot machine UI logic.
 * Extracts and tests the core JS functions from index.html.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/dom";

// ---------------------------------------------------------------------------
// Extracted slot machine logic (mirrors index.html JS)
// ---------------------------------------------------------------------------

const BALL_COLORS = {
  yellow: { numbers: [1, 10], class: "ball-yellow" },
  blue: { numbers: [11, 20], class: "ball-blue" },
  red: { numbers: [21, 30], class: "ball-red" },
  gray: { numbers: [31, 40], class: "ball-gray" },
  green: { numbers: [41, 45], class: "ball-green" },
};

function getBallColorClass(n) {
  if (n <= 10) return "ball-yellow";
  if (n <= 20) return "ball-blue";
  if (n <= 30) return "ball-red";
  if (n <= 40) return "ball-gray";
  return "ball-green";
}

function createBallElement(n) {
  const el = document.createElement("div");
  el.className = `ball ${getBallColorClass(n)}`;
  el.textContent = n;
  return el;
}

function spinBall(ballEl, finalNumber, stopDelay) {
  return new Promise((resolve) => {
    const interval = setInterval(() => {
      const rand = Math.floor(Math.random() * 45) + 1;
      ballEl.textContent = rand;
      ballEl.className = `ball spinning ${getBallColorClass(rand)}`;
    }, 50);

    setTimeout(() => {
      clearInterval(interval);
      ballEl.textContent = finalNumber;
      ballEl.className = `ball stopped ${getBallColorClass(finalNumber)}`;
      resolve();
    }, stopDelay);
  });
}

async function animateRow(rowEl, numbers, baseDelay = 300) {
  const balls = rowEl.querySelectorAll(".ball");
  const promises = numbers.map((n, i) =>
    spinBall(balls[i], n, baseDelay + i * 280)
  );
  await Promise.all(promises);
}

function renderResultRow(numbers, method, methodLabel) {
  const row = document.createElement("div");
  row.className = "result-row";
  row.dataset.method = method;

  const title = document.createElement("span");
  title.className = "method-label";
  title.textContent = methodLabel;
  row.appendChild(title);

  const ballsContainer = document.createElement("div");
  ballsContainer.className = "balls-container";
  numbers.forEach((n) => {
    ballsContainer.appendChild(createBallElement(n));
  });
  row.appendChild(ballsContainer);
  return row;
}

function validateAlgorithmSelection(selected, max = 3) {
  if (selected.length === 0) return { valid: false, error: "하나 이상 선택하세요" };
  if (selected.length > max) return { valid: false, error: `최대 ${max}개까지 선택 가능합니다` };
  return { valid: true };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("getBallColorClass", () => {
  it("returns ball-yellow for 1-10", () => {
    expect(getBallColorClass(1)).toBe("ball-yellow");
    expect(getBallColorClass(10)).toBe("ball-yellow");
  });
  it("returns ball-blue for 11-20", () => {
    expect(getBallColorClass(11)).toBe("ball-blue");
    expect(getBallColorClass(20)).toBe("ball-blue");
  });
  it("returns ball-red for 21-30", () => {
    expect(getBallColorClass(21)).toBe("ball-red");
    expect(getBallColorClass(30)).toBe("ball-red");
  });
  it("returns ball-gray for 31-40", () => {
    expect(getBallColorClass(31)).toBe("ball-gray");
    expect(getBallColorClass(40)).toBe("ball-gray");
  });
  it("returns ball-green for 41-45", () => {
    expect(getBallColorClass(41)).toBe("ball-green");
    expect(getBallColorClass(45)).toBe("ball-green");
  });
});

describe("createBallElement", () => {
  it("creates a div with correct number", () => {
    const el = createBallElement(7);
    expect(el.tagName).toBe("DIV");
    expect(el.textContent).toBe("7");
  });
  it("applies correct color class", () => {
    expect(createBallElement(5).classList.contains("ball-yellow")).toBe(true);
    expect(createBallElement(15).classList.contains("ball-blue")).toBe(true);
    expect(createBallElement(25).classList.contains("ball-red")).toBe(true);
    expect(createBallElement(35).classList.contains("ball-gray")).toBe(true);
    expect(createBallElement(42).classList.contains("ball-green")).toBe(true);
  });
});

describe("spinBall", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("shows spinning class during animation", async () => {
    const ball = document.createElement("div");
    ball.className = "ball";
    const promise = spinBall(ball, 23, 500);
    vi.advanceTimersByTime(100);
    expect(ball.classList.contains("spinning")).toBe(true);
    vi.advanceTimersByTime(500);
    await promise;
  });

  it("shows final number after stop delay", async () => {
    const ball = document.createElement("div");
    const promise = spinBall(ball, 23, 300);
    vi.advanceTimersByTime(300);
    await promise;
    expect(ball.textContent).toBe("23");
  });

  it("applies stopped class after animation", async () => {
    const ball = document.createElement("div");
    const promise = spinBall(ball, 7, 300);
    vi.advanceTimersByTime(300);
    await promise;
    expect(ball.classList.contains("stopped")).toBe(true);
    expect(ball.classList.contains("spinning")).toBe(false);
  });

  it("applies correct color class on final number", async () => {
    const ball = document.createElement("div");
    const promise = spinBall(ball, 15, 300); // 15 = blue
    vi.advanceTimersByTime(300);
    await promise;
    expect(ball.classList.contains("ball-blue")).toBe(true);
  });
});

describe("renderResultRow", () => {
  it("renders 6 balls", () => {
    const row = renderResultRow([3, 11, 22, 33, 41, 45], "apriori", "Apriori");
    const balls = row.querySelectorAll(".ball");
    expect(balls.length).toBe(6);
  });

  it("shows method label", () => {
    const row = renderResultRow([3, 11, 22, 33, 41, 45], "apriori", "Apriori");
    const label = row.querySelector(".method-label");
    expect(label).not.toBeNull();
    expect(label.textContent).toBe("Apriori");
  });

  it("sets data-method attribute", () => {
    const row = renderResultRow([3, 11, 22, 33, 41, 45], "markov", "마르코프");
    expect(row.dataset.method).toBe("markov");
  });

  it("balls have correct numbers", () => {
    const numbers = [3, 11, 22, 33, 41, 45];
    const row = renderResultRow(numbers, "conditional", "조건부확률");
    const balls = [...row.querySelectorAll(".ball")];
    const rendered = balls.map((b) => Number(b.textContent));
    expect(rendered).toEqual(numbers);
  });
});

describe("validateAlgorithmSelection", () => {
  it("rejects empty selection", () => {
    const result = validateAlgorithmSelection([]);
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("rejects more than 3 selections", () => {
    const result = validateAlgorithmSelection(["a", "b", "c", "d"]);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("3");
  });

  it("accepts 1 selection", () => {
    expect(validateAlgorithmSelection(["apriori"]).valid).toBe(true);
  });

  it("accepts exactly 3 selections", () => {
    expect(validateAlgorithmSelection(["apriori", "conditional", "markov"]).valid).toBe(true);
  });
});
