import { describe, it, expect } from "vitest";
import {
  reduce,
  initialState,
  DEFAULT_CONFIG,
  type GameState,
  type Ctx,
  type Outbound,
} from "./game";
import type { ServerMessage } from "../shared/protocol";

// Deterministic rng: always returns 0 -> always picks index 0.
function ctx(now: number, rngValue = 0): Ctx {
  return { now, rng: () => rngValue, config: DEFAULT_CONFIG };
}

function msgsTo(out: Outbound[], to: string | "all"): ServerMessage[] {
  return out.filter((o) => o.to === to || o.to === "all").map((o) => o.msg);
}

function join(state: GameState, id: string, nick: string, now: number) {
  reduce(state, { kind: "CONNECT", id }, ctx(now));
  return reduce(state, { kind: "JOIN", id, nick }, ctx(now));
}

describe("lobby + host", () => {
  it("first joiner becomes host, second does not", () => {
    const s = initialState();
    join(s, "a", "Alice", 0);
    join(s, "b", "Bob", 0);
    expect(s.hostId).toBe("a");
    expect(s.players.get("a")!.isHost).toBe(true);
    expect(s.players.get("b")!.isHost).toBe(false);
  });

  it("reassigns host when host disconnects", () => {
    const s = initialState();
    join(s, "a", "Alice", 0);
    join(s, "b", "Bob", 0);
    reduce(s, { kind: "DISCONNECT", id: "a" }, ctx(1));
    expect(s.hostId).toBe("b");
    expect(s.players.get("b")!.isHost).toBe(true);
  });

  it("ignores START from a non-host", () => {
    const s = initialState();
    join(s, "a", "Alice", 0);
    join(s, "b", "Bob", 0);
    const r = reduce(s, { kind: "START", id: "b" }, ctx(10));
    expect(s.phase).toBe("LOBBY");
    expect(msgsTo(r.out, "all").some((m) => m.t === "MEMORIZE")).toBe(false);
  });
});

describe("round flow", () => {
  it("host START moves to MEMORIZE and broadcasts the scene", () => {
    const s = initialState();
    join(s, "a", "Alice", 0);
    const r = reduce(s, { kind: "START", id: "a" }, ctx(1000));
    expect(s.phase).toBe("MEMORIZE");
    expect(s.memorizeEndsAt).toBe(1000 + DEFAULT_CONFIG.memorizeMs);
    const mem = msgsTo(r.out, "all").find((m) => m.t === "MEMORIZE");
    expect(mem && mem.t === "MEMORIZE" && mem.scene.present.length).toBeGreaterThan(0);
    expect(r.wakeAt).toBe(s.memorizeEndsAt);
  });

  it("TICK after memorize starts QUIZ with the first prompt", () => {
    const s = initialState();
    join(s, "a", "Alice", 0);
    reduce(s, { kind: "START", id: "a" }, ctx(1000));
    const r = reduce(s, { kind: "TICK" }, ctx(1000 + DEFAULT_CONFIG.memorizeMs));
    expect(s.phase).toBe("QUIZ");
    expect(s.currentPromptIndex).toBe(0);
    const prompt = msgsTo(r.out, "all").find((m) => m.t === "PROMPT");
    expect(prompt && prompt.t === "PROMPT" && prompt.total).toBe(DEFAULT_CONFIG.promptsPerRound);
  });

  it("builds exactly promptsPerRound prompts", () => {
    const s = initialState();
    join(s, "a", "Alice", 0);
    reduce(s, { kind: "START", id: "a" }, ctx(1000));
    reduce(s, { kind: "TICK" }, ctx(1000 + DEFAULT_CONFIG.memorizeMs));
    expect(s.prompts.length).toBe(DEFAULT_CONFIG.promptsPerRound);
  });
});

describe("scoring", () => {
  it("a correct, instant answer scores 200 (100 base + 100 speed)", () => {
    const s = initialState();
    join(s, "a", "Alice", 0);
    reduce(s, { kind: "START", id: "a" }, ctx(1000));
    const quizStart = 1000 + DEFAULT_CONFIG.memorizeMs;
    reduce(s, { kind: "TICK" }, ctx(quizStart));
    const p0 = s.prompts[0]!;
    // answer immediately (now == promptStart, full time remaining)
    reduce(
      s,
      { kind: "ANSWER", id: "a", index: 0, value: p0.correctAnswer },
      ctx(quizStart)
    );
    expect(s.players.get("a")!.roundScore).toBe(200);
  });

  it("a wrong answer scores 0", () => {
    const s = initialState();
    join(s, "a", "Alice", 0);
    reduce(s, { kind: "START", id: "a" }, ctx(1000));
    const quizStart = 1000 + DEFAULT_CONFIG.memorizeMs;
    reduce(s, { kind: "TICK" }, ctx(quizStart));
    const p0 = s.prompts[0]!;
    reduce(
      s,
      { kind: "ANSWER", id: "a", index: 0, value: !p0.correctAnswer },
      ctx(quizStart)
    );
    expect(s.players.get("a")!.roundScore).toBe(0);
  });

  it("a correct answer at the deadline scores ~100 (no speed bonus)", () => {
    const s = initialState();
    join(s, "a", "Alice", 0);
    reduce(s, { kind: "START", id: "a" }, ctx(1000));
    const quizStart = 1000 + DEFAULT_CONFIG.memorizeMs;
    reduce(s, { kind: "TICK" }, ctx(quizStart));
    const p0 = s.prompts[0]!;
    reduce(
      s,
      { kind: "ANSWER", id: "a", index: 0, value: p0.correctAnswer },
      ctx(quizStart + DEFAULT_CONFIG.promptMs)
    );
    expect(s.players.get("a")!.roundScore).toBe(100);
  });

  it("ignores a second answer to the same prompt", () => {
    const s = initialState();
    join(s, "a", "Alice", 0);
    reduce(s, { kind: "START", id: "a" }, ctx(1000));
    const quizStart = 1000 + DEFAULT_CONFIG.memorizeMs;
    reduce(s, { kind: "TICK" }, ctx(quizStart));
    const p0 = s.prompts[0]!;
    reduce(s, { kind: "ANSWER", id: "a", index: 0, value: p0.correctAnswer }, ctx(quizStart));
    reduce(s, { kind: "ANSWER", id: "a", index: 0, value: !p0.correctAnswer }, ctx(quizStart));
    expect(s.players.get("a")!.roundScore).toBe(200);
  });
});

describe("advancing + results", () => {
  it("advances early once all active players have answered", () => {
    const s = initialState();
    join(s, "a", "Alice", 0);
    join(s, "b", "Bob", 0);
    reduce(s, { kind: "START", id: "a" }, ctx(1000));
    const quizStart = 1000 + DEFAULT_CONFIG.memorizeMs;
    reduce(s, { kind: "TICK" }, ctx(quizStart));
    reduce(s, { kind: "ANSWER", id: "a", index: 0, value: true }, ctx(quizStart));
    const r = reduce(s, { kind: "ANSWER", id: "b", index: 0, value: true }, ctx(quizStart));
    expect(s.currentPromptIndex).toBe(1);
    expect(msgsTo(r.out, "all").some((m) => m.t === "PROMPT" && m.index === 1)).toBe(true);
  });

  it("ends with RESULTS after the last prompt and accumulates cumulative score", () => {
    const s = initialState();
    join(s, "a", "Alice", 0);
    reduce(s, { kind: "START", id: "a" }, ctx(1000));
    let now = 1000 + DEFAULT_CONFIG.memorizeMs;
    reduce(s, { kind: "TICK" }, ctx(now));
    // Answer every prompt correctly at the deadline (100 each).
    for (let i = 0; i < DEFAULT_CONFIG.promptsPerRound; i++) {
      const p = s.prompts[i]!;
      now += DEFAULT_CONFIG.promptMs;
      reduce(s, { kind: "ANSWER", id: "a", index: i, value: p.correctAnswer }, ctx(now));
      // deadline tick advances to next prompt / results
      reduce(s, { kind: "TICK" }, ctx(now));
    }
    expect(s.phase).toBe("RESULTS");
    expect(s.players.get("a")!.score).toBe(100 * DEFAULT_CONFIG.promptsPerRound);
  });

  it("a player who joins during QUIZ is marked waiting", () => {
    const s = initialState();
    join(s, "a", "Alice", 0);
    reduce(s, { kind: "START", id: "a" }, ctx(1000));
    reduce(s, { kind: "TICK" }, ctx(1000 + DEFAULT_CONFIG.memorizeMs));
    join(s, "b", "Bob", 1000 + DEFAULT_CONFIG.memorizeMs + 10);
    expect(s.players.get("b")!.waiting).toBe(true);
  });
});
