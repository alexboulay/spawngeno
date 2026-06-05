# Memory Rush Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A real-time multiplayer browser memory game where everyone joins one shared room, studies an SVG scene for a few seconds, then answers quickfire "was this object present?" prompts scored on speed + accuracy.

**Architecture:** Authoritative Node WebSocket server owns all timing, scene selection, and scoring via a pure reducer core (`server/game.ts`). Clients (`ws` browser client) only send `JOIN`/`START`/`ANSWER` and render server-broadcast state. Shared TypeScript types and scene data live in `shared/` and are imported by both sides.

**Tech Stack:** Node 24, TypeScript, `ws` (server WebSocket), `tsx` (dev runner), Vite (client), Vitest (tests), `concurrently` (run both).

---

## File Structure

```
memory-rush/
  package.json            # root scripts + deps for everything
  tsconfig.json           # base TS config
  vitest.config.ts        # test config
  shared/
    protocol.ts           # all WS message types + view types
    scenes.ts             # SceneDef[] data + types
  server/
    game.ts               # pure reducer: (state, event, ctx) -> { state, out, wakeAt }
    game.test.ts          # Vitest unit tests for game.ts
    index.ts              # ws server: sockets + timers -> game.ts
  client/
    index.html
    vite.config.ts
    src/
      main.ts             # bootstraps app, mounts #app
      net.ts              # typed WS client wrapper w/ reconnect
      app.ts              # holds client view-state, routes to screens
      screens.ts          # render functions: join/lobby/memorize/quiz/results
      scene.ts            # renders a SceneView to SVG
      styles.css
```

Responsibilities:
- `shared/protocol.ts` — the single source of truth for the client↔server contract.
- `shared/scenes.ts` — static scene content (objects present + decoy pool).
- `server/game.ts` — ALL game logic, pure and testable. No `ws`, no timers, no `Date.now()` inside (time + randomness are injected via `ctx`).
- `server/index.ts` — the only place with side effects: sockets, `Date.now()`, `setTimeout`.
- `client/net.ts` — owns the socket; emits decoded `ServerMessage`s.
- `client/app.ts` — single mutable `view` object + `render()`; no business logic.
- `client/screens.ts` / `client/scene.ts` — pure DOM string builders.

---

## Task 0: Scaffold the project

**Files:**
- Create: `memory-rush/package.json`
- Create: `memory-rush/tsconfig.json`
- Create: `memory-rush/vitest.config.ts`
- Create: `memory-rush/.gitignore`

- [ ] **Step 1: Create the project folder and root package.json**

Create `memory-rush/package.json`:

```json
{
  "name": "memory-rush",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "concurrently -n server,client -c green,cyan \"npm:dev:server\" \"npm:dev:client\"",
    "dev:server": "tsx watch server/index.ts",
    "dev:client": "vite client",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "@types/ws": "^8.5.12",
    "concurrently": "^9.1.0",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vite": "^6.0.5",
    "vitest": "^2.1.8"
  },
  "dependencies": {
    "ws": "^8.18.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

Create `memory-rush/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "verbatimModuleSyntax": false,
    "types": ["node"]
  },
  "include": ["shared", "server", "client/src"]
}
```

- [ ] **Step 3: Create vitest config and gitignore**

Create `memory-rush/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["server/**/*.test.ts"],
  },
});
```

Create `memory-rush/.gitignore`:

```
node_modules
dist
*.log
```

- [ ] **Step 4: Install dependencies**

Run: `cd memory-rush && npm install`
Expected: completes with no errors; `node_modules/` created.

- [ ] **Step 5: Commit**

```bash
cd memory-rush && git init -q && git add -A && git commit -q -m "chore: scaffold memory-rush project"
```

(If `git init` reports the repo already exists, skip it and just `git add -A && git commit`.)

---

## Task 1: Shared protocol types

**Files:**
- Create: `memory-rush/shared/protocol.ts`

- [ ] **Step 1: Write the protocol types**

Create `memory-rush/shared/protocol.ts`:

```ts
// The client <-> server contract. Single source of truth for both sides.

export type Phase = "LOBBY" | "MEMORIZE" | "QUIZ" | "RESULTS";

/** An object as shown in a quiz prompt. */
export interface PromptObject {
  id: string;
  label: string;
  emoji: string;
}

/** An object placed in a scene (extends PromptObject with SVG position). */
export interface SceneObject extends PromptObject {
  /** 0..100 percentage coordinates within the scene viewport. */
  x: number;
  y: number;
}

/** The scene as broadcast to clients during MEMORIZE (no decoy info leaked). */
export interface SceneView {
  id: string;
  title: string;
  present: SceneObject[];
}

export interface PlayerView {
  id: string;
  nick: string;
  score: number; // cumulative across rounds
  isHost: boolean;
  waiting: boolean; // joined mid-round; scorable next round
}

export interface RoundScore {
  id: string;
  nick: string;
  roundScore: number;
}

// ---- Client -> Server ----
export type ClientMessage =
  | { t: "JOIN"; nick: string }
  | { t: "START" }
  | { t: "ANSWER"; index: number; value: boolean };

// ---- Server -> Client ----
export type ServerMessage =
  | { t: "WELCOME"; playerId: string; isHost: boolean }
  | { t: "LOBBY"; phase: Phase; players: PlayerView[]; hostId: string | null }
  | { t: "MEMORIZE"; scene: SceneView; endsAt: number }
  | { t: "PROMPT"; index: number; total: number; object: PromptObject; endsAt: number }
  | { t: "PROMPT_RESULT"; index: number; correctAnswer: boolean }
  | { t: "RESULTS"; roundScores: RoundScore[]; leaderboard: PlayerView[] }
  | { t: "ERROR"; message: string };
```

- [ ] **Step 2: Typecheck**

Run: `cd memory-rush && npx tsc --noEmit`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
cd memory-rush && git add -A && git commit -q -m "feat: shared protocol types"
```

---

## Task 2: Scene data

**Files:**
- Create: `memory-rush/shared/scenes.ts`

- [ ] **Step 1: Write the scene definitions**

Create `memory-rush/shared/scenes.ts`:

```ts
import type { PromptObject, SceneObject } from "./protocol";

export interface SceneDef {
  id: string;
  title: string;
  /** Objects drawn in the scene (correct YES answers). */
  present: SceneObject[];
  /** Plausible objects NOT in the scene (correct NO answers). */
  decoys: PromptObject[];
}

export const SCENES: SceneDef[] = [
  {
    id: "living-room",
    title: "Living Room",
    present: [
      { id: "sofa", label: "Sofa", emoji: "🛋️", x: 28, y: 62 },
      { id: "tv", label: "TV", emoji: "📺", x: 70, y: 40 },
      { id: "lamp", label: "Lamp", emoji: "💡", x: 16, y: 30 },
      { id: "plant", label: "Plant", emoji: "🪴", x: 85, y: 66 },
      { id: "clock", label: "Clock", emoji: "🕐", x: 50, y: 18 },
      { id: "cat", label: "Cat", emoji: "🐱", x: 42, y: 78 },
      { id: "book", label: "Book", emoji: "📖", x: 60, y: 70 },
    ],
    decoys: [
      { id: "fish", label: "Fish", emoji: "🐟" },
      { id: "umbrella", label: "Umbrella", emoji: "🌂" },
      { id: "guitar", label: "Guitar", emoji: "🎸" },
      { id: "cactus", label: "Cactus", emoji: "🌵" },
      { id: "phone", label: "Phone", emoji: "📱" },
    ],
  },
  {
    id: "park",
    title: "Park",
    present: [
      { id: "tree", label: "Tree", emoji: "🌳", x: 20, y: 40 },
      { id: "bench", label: "Bench", emoji: "🪑", x: 48, y: 70 },
      { id: "dog", label: "Dog", emoji: "🐕", x: 64, y: 78 },
      { id: "kite", label: "Kite", emoji: "🪁", x: 78, y: 22 },
      { id: "ball", label: "Ball", emoji: "⚽", x: 36, y: 82 },
      { id: "bird", label: "Bird", emoji: "🐦", x: 30, y: 24 },
      { id: "flower", label: "Flower", emoji: "🌻", x: 86, y: 74 },
    ],
    decoys: [
      { id: "car", label: "Car", emoji: "🚗" },
      { id: "tv2", label: "TV", emoji: "📺" },
      { id: "pizza", label: "Pizza", emoji: "🍕" },
      { id: "umbrella2", label: "Umbrella", emoji: "🌂" },
      { id: "snowman", label: "Snowman", emoji: "⛄" },
    ],
  },
  {
    id: "kitchen",
    title: "Kitchen",
    present: [
      { id: "fridge", label: "Fridge", emoji: "🧊", x: 18, y: 52 },
      { id: "apple", label: "Apple", emoji: "🍎", x: 44, y: 66 },
      { id: "knife", label: "Knife", emoji: "🔪", x: 58, y: 60 },
      { id: "kettle", label: "Kettle", emoji: "🫖", x: 72, y: 56 },
      { id: "bread", label: "Bread", emoji: "🍞", x: 36, y: 70 },
      { id: "mug", label: "Mug", emoji: "☕", x: 82, y: 68 },
      { id: "carrot", label: "Carrot", emoji: "🥕", x: 50, y: 78 },
    ],
    decoys: [
      { id: "soccer", label: "Soccer Ball", emoji: "⚽" },
      { id: "rocket", label: "Rocket", emoji: "🚀" },
      { id: "guitar2", label: "Guitar", emoji: "🎸" },
      { id: "dog2", label: "Dog", emoji: "🐕" },
      { id: "flower2", label: "Flower", emoji: "🌻" },
    ],
  },
];
```

- [ ] **Step 2: Typecheck**

Run: `cd memory-rush && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd memory-rush && git add -A && git commit -q -m "feat: scene data (living room, park, kitchen)"
```

---

## Task 3: Game reducer core (TDD)

This is the heart of the app: a pure function with no I/O. Time and randomness are injected through `ctx` so tests are deterministic.

**Files:**
- Create: `memory-rush/server/game.ts`
- Test: `memory-rush/server/game.test.ts`

- [ ] **Step 1: Write the game.ts type skeleton + signature (no logic yet)**

Create `memory-rush/server/game.ts`:

```ts
import type {
  Phase,
  PlayerView,
  PromptObject,
  RoundScore,
  ServerMessage,
} from "../shared/protocol";
import { SCENES, type SceneDef } from "../shared/scenes";

export interface GameConfig {
  promptsPerRound: number;
  memorizeMs: number;
  promptMs: number;
}

export const DEFAULT_CONFIG: GameConfig = {
  promptsPerRound: 8,
  memorizeMs: 6000,
  promptMs: 4000,
};

interface Player {
  id: string;
  nick: string | null; // null until JOIN
  score: number;
  connected: boolean;
  isHost: boolean;
  waiting: boolean;
  roundScore: number;
  answered: Set<number>;
}

interface RoundPrompt {
  object: PromptObject;
  correctAnswer: boolean;
}

export interface GameState {
  phase: Phase;
  players: Map<string, Player>;
  hostId: string | null;
  scene: SceneDef | null;
  prompts: RoundPrompt[];
  currentPromptIndex: number;
  promptEndsAt: number | null;
  memorizeEndsAt: number | null;
}

export type GameEvent =
  | { kind: "CONNECT"; id: string }
  | { kind: "JOIN"; id: string; nick: string }
  | { kind: "DISCONNECT"; id: string }
  | { kind: "START"; id: string }
  | { kind: "ANSWER"; id: string; index: number; value: boolean }
  | { kind: "TICK" };

export interface Outbound {
  to: "all" | string;
  msg: ServerMessage;
}

export interface Ctx {
  now: number;
  rng: () => number;
  config: GameConfig;
}

export interface Reduced {
  out: Outbound[];
  /** Epoch ms the server should next call TICK, or null if no timer needed. */
  wakeAt: number | null;
}

export function initialState(): GameState {
  return {
    phase: "LOBBY",
    players: new Map(),
    hostId: null,
    scene: null,
    prompts: [],
    currentPromptIndex: -1,
    promptEndsAt: null,
    memorizeEndsAt: null,
  };
}

// reduce() mutates `state` in place and returns outbound messages + next wake time.
export function reduce(state: GameState, event: GameEvent, ctx: Ctx): Reduced {
  throw new Error("not implemented");
}
```

- [ ] **Step 2: Write failing tests**

Create `memory-rush/server/game.test.ts`:

```ts
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
```

- [ ] **Step 3: Run tests to verify they FAIL**

Run: `cd memory-rush && npx vitest run`
Expected: FAIL — every test errors with "not implemented".

- [ ] **Step 4: Implement reduce() to make tests pass**

Replace the `reduce` function (and add helpers) in `memory-rush/server/game.ts`. Replace the final `export function reduce(...) { throw ... }` with:

```ts
function playerViews(state: GameState): PlayerView[] {
  return [...state.players.values()]
    .filter((p) => p.nick !== null)
    .map((p) => ({
      id: p.id,
      nick: p.nick!,
      score: p.score,
      isHost: p.isHost,
      waiting: p.waiting,
    }))
    .sort((a, b) => b.score - a.score);
}

function lobbyBroadcast(state: GameState): Outbound {
  return {
    to: "all",
    msg: {
      t: "LOBBY",
      phase: state.phase,
      players: playerViews(state),
      hostId: state.hostId,
    },
  };
}

function activePlayers(state: GameState) {
  return [...state.players.values()].filter(
    (p) => p.connected && p.nick !== null && !p.waiting
  );
}

function ensureHost(state: GameState) {
  if (state.hostId && state.players.get(state.hostId)?.connected) return;
  const next = [...state.players.values()].find((p) => p.connected && p.nick !== null);
  state.hostId = next ? next.id : null;
  for (const p of state.players.values()) p.isHost = p.id === state.hostId;
}

function buildPrompts(state: GameState, ctx: Ctx): RoundPrompt[] {
  const scene = state.scene!;
  const present = scene.present.map((o) => ({
    object: { id: o.id, label: o.label, emoji: o.emoji },
    correctAnswer: true,
  }));
  const decoys = scene.decoys.map((o) => ({ object: o, correctAnswer: false }));
  const pool = [...present, ...decoys];
  // Fisher–Yates using injected rng.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(ctx.rng() * (i + 1));
    const tmp = pool[i]!;
    pool[i] = pool[j]!;
    pool[j] = tmp;
  }
  return pool.slice(0, ctx.config.promptsPerRound);
}

function emitPrompt(state: GameState, ctx: Ctx): Reduced {
  const p = state.prompts[state.currentPromptIndex]!;
  state.promptEndsAt = ctx.now + ctx.config.promptMs;
  return {
    out: [
      {
        to: "all",
        msg: {
          t: "PROMPT",
          index: state.currentPromptIndex,
          total: state.prompts.length,
          object: p.object,
          endsAt: state.promptEndsAt,
        },
      },
    ],
    wakeAt: state.promptEndsAt,
  };
}

function finishRound(state: GameState): Reduced {
  state.phase = "RESULTS";
  state.promptEndsAt = null;
  for (const p of state.players.values()) p.score += p.roundScore;
  const roundScores: RoundScore[] = [...state.players.values()]
    .filter((p) => p.nick !== null)
    .map((p) => ({ id: p.id, nick: p.nick!, roundScore: p.roundScore }))
    .sort((a, b) => b.roundScore - a.roundScore);
  return {
    out: [
      { to: "all", msg: { t: "RESULTS", roundScores, leaderboard: playerViews(state) } },
      lobbyBroadcast(state),
    ],
    wakeAt: null,
  };
}

function advance(state: GameState, ctx: Ctx): Reduced {
  state.currentPromptIndex++;
  if (state.currentPromptIndex >= state.prompts.length) {
    return finishRound(state);
  }
  return emitPrompt(state, ctx);
}

function allAnswered(state: GameState): boolean {
  const active = activePlayers(state);
  if (active.length === 0) return false;
  return active.every((p) => p.answered.has(state.currentPromptIndex));
}

export function reduce(state: GameState, event: GameEvent, ctx: Ctx): Reduced {
  switch (event.kind) {
    case "CONNECT": {
      state.players.set(event.id, {
        id: event.id,
        nick: null,
        score: 0,
        connected: true,
        isHost: false,
        waiting: false,
        roundScore: 0,
        answered: new Set(),
      });
      return { out: [], wakeAt: null };
    }

    case "JOIN": {
      const p = state.players.get(event.id);
      if (!p) return { out: [], wakeAt: null };
      p.nick = event.nick;
      p.waiting = state.phase !== "LOBBY";
      ensureHost(state);
      return {
        out: [
          { to: event.id, msg: { t: "WELCOME", playerId: event.id, isHost: p.isHost } },
          lobbyBroadcast(state),
        ],
        wakeAt: null,
      };
    }

    case "DISCONNECT": {
      state.players.delete(event.id);
      ensureHost(state);
      if (state.players.size === 0) {
        const fresh = initialState();
        Object.assign(state, fresh);
        return { out: [], wakeAt: null };
      }
      return { out: [lobbyBroadcast(state)], wakeAt: null };
    }

    case "START": {
      if (event.id !== state.hostId) return { out: [], wakeAt: null };
      if (state.phase === "MEMORIZE" || state.phase === "QUIZ") {
        return { out: [], wakeAt: null };
      }
      // Reset per-round state for everyone; mark all current players active.
      for (const p of state.players.values()) {
        p.roundScore = 0;
        p.answered = new Set();
        p.waiting = false;
      }
      const idx = Math.floor(ctx.rng() * SCENES.length);
      state.scene = SCENES[idx]!;
      state.prompts = [];
      state.currentPromptIndex = -1;
      state.phase = "MEMORIZE";
      state.memorizeEndsAt = ctx.now + ctx.config.memorizeMs;
      const scene = state.scene;
      return {
        out: [
          {
            to: "all",
            msg: {
              t: "MEMORIZE",
              scene: { id: scene.id, title: scene.title, present: scene.present },
              endsAt: state.memorizeEndsAt,
            },
          },
        ],
        wakeAt: state.memorizeEndsAt,
      };
    }

    case "ANSWER": {
      if (state.phase !== "QUIZ") return { out: [], wakeAt: null };
      if (event.index !== state.currentPromptIndex) return { out: [], wakeAt: null };
      const p = state.players.get(event.id);
      if (!p || p.waiting || p.answered.has(event.index)) {
        return { out: [], wakeAt: null };
      }
      p.answered.add(event.index);
      const prompt = state.prompts[event.index]!;
      if (event.value === prompt.correctAnswer) {
        const remaining = Math.max(0, (state.promptEndsAt ?? ctx.now) - ctx.now);
        const bonus = Math.round((remaining / ctx.config.promptMs) * 100);
        p.roundScore += 100 + bonus;
      }
      if (allAnswered(state)) {
        return advance(state, ctx);
      }
      return { out: [], wakeAt: state.promptEndsAt };
    }

    case "TICK": {
      if (state.phase === "MEMORIZE" && state.memorizeEndsAt !== null && ctx.now >= state.memorizeEndsAt) {
        state.phase = "QUIZ";
        state.prompts = buildPrompts(state, ctx);
        state.currentPromptIndex = -1;
        state.memorizeEndsAt = null;
        return advance(state, ctx);
      }
      if (state.phase === "QUIZ" && state.promptEndsAt !== null && ctx.now >= state.promptEndsAt) {
        const prompt = state.prompts[state.currentPromptIndex];
        const out: Outbound[] = prompt
          ? [{ to: "all", msg: { t: "PROMPT_RESULT", index: state.currentPromptIndex, correctAnswer: prompt.correctAnswer } }]
          : [];
        const next = advance(state, ctx);
        return { out: [...out, ...next.out], wakeAt: next.wakeAt };
      }
      return { out: [], wakeAt: state.promptEndsAt ?? state.memorizeEndsAt };
    }
  }
}
```

- [ ] **Step 5: Run tests to verify they PASS**

Run: `cd memory-rush && npx vitest run`
Expected: PASS — all tests green.

- [ ] **Step 6: Typecheck**

Run: `cd memory-rush && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
cd memory-rush && git add -A && git commit -q -m "feat: game reducer core with tests"
```

---

## Task 4: WebSocket server

**Files:**
- Create: `memory-rush/server/index.ts`

- [ ] **Step 1: Write the server wiring**

Create `memory-rush/server/index.ts`:

```ts
import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import type { ClientMessage } from "../shared/protocol";
import {
  reduce,
  initialState,
  DEFAULT_CONFIG,
  type GameState,
  type GameEvent,
  type Outbound,
} from "./game";

const PORT = Number(process.env.PORT ?? 8787);
const wss = new WebSocketServer({ port: PORT });

const state: GameState = initialState();
const sockets = new Map<string, WebSocket>();
let timer: ReturnType<typeof setTimeout> | null = null;

function ctx() {
  return { now: Date.now(), rng: Math.random, config: DEFAULT_CONFIG };
}

function deliver(out: Outbound[]) {
  for (const o of out) {
    const data = JSON.stringify(o.msg);
    if (o.to === "all") {
      for (const ws of sockets.values()) {
        if (ws.readyState === WebSocket.OPEN) ws.send(data);
      }
    } else {
      const ws = sockets.get(o.to);
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(data);
    }
  }
}

function scheduleWake(wakeAt: number | null) {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (wakeAt === null) return;
  const delay = Math.max(0, wakeAt - Date.now());
  timer = setTimeout(() => {
    timer = null;
    dispatch({ kind: "TICK" });
  }, delay);
}

function dispatch(event: GameEvent) {
  const { out, wakeAt } = reduce(state, event, ctx());
  deliver(out);
  scheduleWake(wakeAt);
}

wss.on("connection", (ws) => {
  const id = randomUUID();
  sockets.set(id, ws);
  dispatch({ kind: "CONNECT", id });

  ws.on("message", (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString()) as ClientMessage;
    } catch {
      return;
    }
    if (msg.t === "JOIN") dispatch({ kind: "JOIN", id, nick: msg.nick.slice(0, 24) || "Player" });
    else if (msg.t === "START") dispatch({ kind: "START", id });
    else if (msg.t === "ANSWER") dispatch({ kind: "ANSWER", id, index: msg.index, value: msg.value });
  });

  ws.on("close", () => {
    sockets.delete(id);
    dispatch({ kind: "DISCONNECT", id });
  });
});

console.log(`Memory Rush server listening on ws://localhost:${PORT}`);
```

- [ ] **Step 2: Typecheck**

Run: `cd memory-rush && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Smoke-test the server boots**

Run: `cd memory-rush && timeout 3 npx tsx server/index.ts || true`
Expected: prints `Memory Rush server listening on ws://localhost:8787` then exits after the timeout.

- [ ] **Step 4: Commit**

```bash
cd memory-rush && git add -A && git commit -q -m "feat: websocket server wiring + timers"
```

---

## Task 5: Client networking + HTML shell

**Files:**
- Create: `memory-rush/client/index.html`
- Create: `memory-rush/client/vite.config.ts`
- Create: `memory-rush/client/src/net.ts`
- Create: `memory-rush/client/src/styles.css`

- [ ] **Step 1: Create the HTML shell + Vite config**

Create `memory-rush/client/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#0f1020" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <title>Memory Rush</title>
    <link rel="stylesheet" href="/src/styles.css" />
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

Create `memory-rush/client/vite.config.ts`:

```ts
import { defineConfig } from "vite";

export default defineConfig({
  server: { port: 5174 },
});
```

- [ ] **Step 2: Create the net client**

Create `memory-rush/client/src/net.ts`:

```ts
import type { ClientMessage, ServerMessage } from "../../shared/protocol";

type Handler = (msg: ServerMessage) => void;

const WS_URL = `ws://${location.hostname}:8787`;

export class Net {
  private ws: WebSocket | null = null;
  private handler: Handler;
  private queue: ClientMessage[] = [];

  constructor(handler: Handler) {
    this.handler = handler;
    this.connect();
  }

  private connect() {
    const ws = new WebSocket(WS_URL);
    this.ws = ws;
    ws.onopen = () => {
      for (const m of this.queue) ws.send(JSON.stringify(m));
      this.queue = [];
    };
    ws.onmessage = (e) => {
      try {
        this.handler(JSON.parse(e.data) as ServerMessage);
      } catch {
        /* ignore malformed frames */
      }
    };
    ws.onclose = () => {
      this.ws = null;
      setTimeout(() => this.connect(), 1000);
    };
  }

  send(msg: ClientMessage) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      this.queue.push(msg);
    }
  }
}
```

- [ ] **Step 3: Create base styles**

Create `memory-rush/client/src/styles.css`:

Mobile-first: phones in portrait are the target; the layout is full-bleed with
safe-area padding and scales up to a centered column on desktop. Touch targets are
≥44px, the YES/NO choices are split 50/50 and thumb-reachable, inputs use ≥16px font
(avoids iOS auto-zoom), and `touch-action: manipulation` suppresses double-tap zoom on
controls.

```css
:root {
  color-scheme: dark;
  --bg: #0f1020;
  --panel: #1b1d3a;
  --accent: #6c7bff;
  --good: #36d399;
  --bad: #ff5d73;
  --text: #eef0ff;
  font-family: system-ui, sans-serif;
  /* Prevent mobile browsers from auto-inflating text. */
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
}
* { box-sizing: border-box; }
html, body { height: 100%; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  /* Avoid rubber-band scroll bleed during fast-paced play. */
  overscroll-behavior: none;
}
#app {
  width: 100%;
  max-width: 560px; /* caps on tablet/desktop; full-bleed on phones */
  margin: 0 auto;
  min-height: 100dvh; /* fill the small-viewport height */
  /* Respect notches / home indicator. */
  padding: max(16px, env(safe-area-inset-top))
           max(16px, env(safe-area-inset-right))
           max(16px, env(safe-area-inset-bottom))
           max(16px, env(safe-area-inset-left));
}
h1 { text-align: center; letter-spacing: 1px; font-size: clamp(24px, 7vw, 34px); }
.panel { background: var(--panel); border-radius: 16px; padding: 18px; margin: 12px 0; }
button {
  background: var(--accent); color: white; border: 0; border-radius: 12px;
  padding: 14px 22px; font-size: 18px; cursor: pointer; font-weight: 600;
  min-height: 48px; /* comfortable touch target */
  touch-action: manipulation; /* no double-tap zoom */
  -webkit-tap-highlight-color: transparent;
}
button:disabled { opacity: 0.4; cursor: default; }
input {
  background: #0c0d1c; border: 1px solid #34376a; color: var(--text);
  border-radius: 10px; padding: 14px; font-size: 18px; width: 100%;
  min-height: 48px;
}
.row { display: flex; gap: 12px; align-items: center; }
/* Stack the join row on the narrowest screens. */
@media (max-width: 380px) {
  .row { flex-direction: column; align-items: stretch; }
}
.center { text-align: center; }
.big { font-size: clamp(56px, 22vw, 88px); margin: 8px 0; line-height: 1; }
.timer { font-size: clamp(36px, 12vw, 48px); font-weight: 700; text-align: center; }
.scene { position: relative; width: 100%; aspect-ratio: 4 / 5; /* portrait-friendly */
  background: linear-gradient(#22244a, #15172f); border-radius: 16px; overflow: hidden; }
.scene .obj { position: absolute; transform: translate(-50%, -50%);
  font-size: clamp(34px, 11vw, 48px); }
.choices { display: flex; gap: 16px; justify-content: center; margin-top: 24px; }
.choices button { flex: 1; min-height: 64px; font-size: 22px; } /* big, thumb-reachable */
.yes { background: var(--good); }
.no { background: var(--bad); }
.list { list-style: none; padding: 0; margin: 0; }
.list li { display: flex; justify-content: space-between; padding: 12px 14px;
  border-radius: 10px; background: #0c0d1c; margin: 6px 0; }
.host-badge { color: var(--accent); font-size: 14px; }
.flash-good { outline: 4px solid var(--good); }
.flash-bad { outline: 4px solid var(--bad); }
```

- [ ] **Step 4: Typecheck**

Run: `cd memory-rush && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd memory-rush && git add -A && git commit -q -m "feat: client shell, styles, and net layer"
```

---

## Task 6: Scene renderer

**Files:**
- Create: `memory-rush/client/src/scene.ts`

- [ ] **Step 1: Write the scene renderer**

Create `memory-rush/client/src/scene.ts`:

```ts
import type { SceneView } from "../../shared/protocol";

/** Returns an HTML string rendering the scene's objects positioned in the box. */
export function renderScene(scene: SceneView): string {
  const objs = scene.present
    .map(
      (o) =>
        `<span class="obj" style="left:${o.x}%;top:${o.y}%" title="${o.label}">${o.emoji}</span>`
    )
    .join("");
  return `
    <div class="center"><strong>${scene.title}</strong> — memorize everything!</div>
    <div class="scene">${objs}</div>
  `;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd memory-rush && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd memory-rush && git add -A && git commit -q -m "feat: SVG/emoji scene renderer"
```

---

## Task 7: Screens + app controller

**Files:**
- Create: `memory-rush/client/src/screens.ts`
- Create: `memory-rush/client/src/app.ts`
- Create: `memory-rush/client/src/main.ts`

- [ ] **Step 1: Write the screen render functions**

Create `memory-rush/client/src/screens.ts`:

```ts
import type { PlayerView, PromptObject, RoundScore, SceneView } from "../../shared/protocol";
import { renderScene } from "./scene";

export function joinScreen(): string {
  return `
    <h1>🧠 Memory Rush</h1>
    <div class="panel">
      <p class="center">Pick a nickname to join the room.</p>
      <div class="row">
        <input id="nick" placeholder="Your nickname" maxlength="24" />
        <button id="joinBtn">Join</button>
      </div>
    </div>`;
}

export function lobbyScreen(players: PlayerView[], isHost: boolean): string {
  const list = players
    .map(
      (p) =>
        `<li><span>${p.nick} ${p.isHost ? '<span class="host-badge">host</span>' : ""}</span><span>${p.score}</span></li>`
    )
    .join("");
  const control = isHost
    ? `<button id="startBtn">Start round</button>`
    : `<p class="center">Waiting for the host to start…</p>`;
  return `
    <h1>🧠 Memory Rush</h1>
    <div class="panel">
      <h3>Players</h3>
      <ul class="list">${list}</ul>
    </div>
    <div class="panel center">${control}</div>`;
}

export function memorizeScreen(scene: SceneView, secondsLeft: number): string {
  return `
    <h1>🧠 Memory Rush</h1>
    <div class="panel">
      <div class="timer">${secondsLeft}</div>
      ${renderScene(scene)}
    </div>`;
}

export function quizScreen(
  object: PromptObject,
  index: number,
  total: number,
  secondsLeft: number,
  flash: "good" | "bad" | null
): string {
  const flashClass = flash === "good" ? "flash-good" : flash === "bad" ? "flash-bad" : "";
  return `
    <h1>🧠 Memory Rush</h1>
    <div class="panel center ${flashClass}">
      <div>Question ${index + 1} / ${total} · <strong>${secondsLeft}s</strong></div>
      <div class="big">${object.emoji}</div>
      <div>Was the <strong>${object.label}</strong> in the scene?</div>
      <div class="choices">
        <button class="yes" id="yesBtn">YES</button>
        <button class="no" id="noBtn">NO</button>
      </div>
    </div>`;
}

export function resultsScreen(
  roundScores: RoundScore[],
  leaderboard: PlayerView[],
  isHost: boolean
): string {
  const round = roundScores
    .map((r) => `<li><span>${r.nick}</span><span>+${r.roundScore}</span></li>`)
    .join("");
  const board = leaderboard
    .map((p, i) => `<li><span>${i + 1}. ${p.nick}</span><span>${p.score}</span></li>`)
    .join("");
  const control = isHost
    ? `<button id="startBtn">Next round</button>`
    : `<p class="center">Waiting for the host…</p>`;
  return `
    <h1>🏁 Results</h1>
    <div class="panel"><h3>This round</h3><ul class="list">${round}</ul></div>
    <div class="panel"><h3>Leaderboard</h3><ul class="list">${board}</ul></div>
    <div class="panel center">${control}</div>`;
}
```

- [ ] **Step 2: Write the app controller**

Create `memory-rush/client/src/app.ts`:

```ts
import type {
  PlayerView,
  PromptObject,
  RoundScore,
  SceneView,
  ServerMessage,
} from "../../shared/protocol";
import { Net } from "./net";
import {
  joinScreen,
  lobbyScreen,
  memorizeScreen,
  quizScreen,
  resultsScreen,
} from "./screens";

type Screen = "JOIN" | "LOBBY" | "MEMORIZE" | "QUIZ" | "RESULTS";

interface View {
  screen: Screen;
  isHost: boolean;
  players: PlayerView[];
  scene: SceneView | null;
  prompt: { object: PromptObject; index: number; total: number } | null;
  endsAt: number | null;
  answered: boolean;
  flash: "good" | "bad" | null;
  roundScores: RoundScore[];
  leaderboard: PlayerView[];
}

export function start() {
  const root = document.getElementById("app")!;
  const view: View = {
    screen: "JOIN",
    isHost: false,
    players: [],
    scene: null,
    prompt: null,
    endsAt: null,
    answered: false,
    flash: null,
    roundScores: [],
    leaderboard: [],
  };

  const net = new Net(onMessage);

  function secondsLeft(): number {
    if (view.endsAt === null) return 0;
    return Math.max(0, Math.ceil((view.endsAt - Date.now()) / 1000));
  }

  function render() {
    let html = "";
    switch (view.screen) {
      case "JOIN":
        html = joinScreen();
        break;
      case "LOBBY":
        html = lobbyScreen(view.players, view.isHost);
        break;
      case "MEMORIZE":
        html = view.scene ? memorizeScreen(view.scene, secondsLeft()) : "";
        break;
      case "QUIZ":
        html = view.prompt
          ? quizScreen(view.prompt.object, view.prompt.index, view.prompt.total, secondsLeft(), view.flash)
          : "";
        break;
      case "RESULTS":
        html = resultsScreen(view.roundScores, view.leaderboard, view.isHost);
        break;
    }
    root.innerHTML = html;
    wireHandlers();
  }

  function wireHandlers() {
    const joinBtn = document.getElementById("joinBtn");
    if (joinBtn) {
      joinBtn.onclick = () => {
        const input = document.getElementById("nick") as HTMLInputElement | null;
        const nick = (input?.value ?? "").trim();
        if (nick) net.send({ t: "JOIN", nick });
      };
    }
    const startBtn = document.getElementById("startBtn");
    if (startBtn) startBtn.onclick = () => net.send({ t: "START" });

    const yesBtn = document.getElementById("yesBtn");
    const noBtn = document.getElementById("noBtn");
    if (yesBtn) yesBtn.onclick = () => answer(true);
    if (noBtn) noBtn.onclick = () => answer(false);
  }

  function answer(value: boolean) {
    if (view.answered || !view.prompt) return;
    view.answered = true;
    net.send({ t: "ANSWER", index: view.prompt.index, value });
    // local feedback only; server is authoritative for score
    const yesBtn = document.getElementById("yesBtn") as HTMLButtonElement | null;
    const noBtn = document.getElementById("noBtn") as HTMLButtonElement | null;
    if (yesBtn) yesBtn.disabled = true;
    if (noBtn) noBtn.disabled = true;
  }

  function onMessage(msg: ServerMessage) {
    switch (msg.t) {
      case "WELCOME":
        view.isHost = msg.isHost;
        if (view.screen === "JOIN") view.screen = "LOBBY";
        break;
      case "LOBBY":
        view.players = msg.players;
        view.isHost = msg.hostId !== null && view.players.some((p) => p.isHost && isMe(p, msg));
        // simpler: recompute host from players using our own id is unnecessary;
        // WELCOME set isHost and LOBBY carries isHost per player — keep WELCOME's value
        // unless this LOBBY reflects a host change. Use per-player flag:
        view.isHost = playerIsHostForUs(view, msg);
        if (view.screen === "JOIN") break; // not joined yet
        if (msg.phase === "LOBBY") view.screen = "LOBBY";
        break;
      case "MEMORIZE":
        view.scene = msg.scene;
        view.endsAt = msg.endsAt;
        view.screen = "MEMORIZE";
        break;
      case "PROMPT":
        view.prompt = { object: msg.object, index: msg.index, total: msg.total };
        view.endsAt = msg.endsAt;
        view.answered = false;
        view.flash = null;
        view.screen = "QUIZ";
        break;
      case "PROMPT_RESULT":
        view.flash = null;
        break;
      case "RESULTS":
        view.roundScores = msg.roundScores;
        view.leaderboard = msg.leaderboard;
        view.screen = "RESULTS";
        break;
      case "ERROR":
        console.warn("server error:", msg.message);
        break;
    }
    render();
  }

  // Tick countdowns once per second so the timer updates.
  setInterval(() => {
    if (view.screen === "MEMORIZE" || view.screen === "QUIZ") render();
  }, 250);

  render();
}

// We do not track our own playerId for host detection beyond WELCOME, but LOBBY
// can change the host. Track host via the WELCOME id.
let myId: string | null = null;

function isMe(p: PlayerView, _msg: Extract<ServerMessage, { t: "LOBBY" }>): boolean {
  return myId !== null && p.id === myId;
}

function playerIsHostForUs(_view: View, msg: Extract<ServerMessage, { t: "LOBBY" }>): boolean {
  return myId !== null && msg.hostId === myId;
}

export function setMyId(id: string) {
  myId = id;
}
```

> Note: `app.ts` references `myId` for host detection on LOBBY updates. Wire it in `main.ts` (next step) by capturing the id from `WELCOME`. To keep `app.ts` self-contained, adjust `onMessage`'s `WELCOME` case to also call `setMyId(msg.playerId)`.

- [ ] **Step 3: Fix WELCOME to capture our id**

Edit `memory-rush/client/src/app.ts`: in the `WELCOME` case of `onMessage`, add `setMyId(msg.playerId);` as the first line, and import it is unnecessary since it's in the same module. The `WELCOME` case becomes:

```ts
      case "WELCOME":
        setMyId(msg.playerId);
        view.isHost = msg.isHost;
        if (view.screen === "JOIN") view.screen = "LOBBY";
        break;
```

Also simplify the `LOBBY` case to remove the dead intermediate assignments — replace the whole `LOBBY` case with:

```ts
      case "LOBBY":
        view.players = msg.players;
        view.isHost = playerIsHostForUs(view, msg);
        if (view.screen !== "JOIN" && msg.phase === "LOBBY") view.screen = "LOBBY";
        break;
```

- [ ] **Step 4: Write main.ts**

Create `memory-rush/client/src/main.ts`:

```ts
import { start } from "./app";

start();
```

- [ ] **Step 5: Typecheck**

Run: `cd memory-rush && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd memory-rush && git add -A && git commit -q -m "feat: client screens and app controller"
```

---

## Task 8: End-to-end manual verification

**Files:** none (manual run).

- [ ] **Step 1: Start the app**

Run: `cd memory-rush && npm run dev`
Expected: server logs `listening on ws://localhost:8787`; Vite serves the client on `http://localhost:5174`.

- [ ] **Step 2: Verify the full loop with two tabs**

Open `http://localhost:5174` in two browser tabs (or windows):
1. Tab A: enter nickname "Alice", Join → lands in lobby, shows a **Start round** button (host).
2. Tab B: enter nickname "Bob", Join → lobby lists Alice + Bob; Bob sees "waiting for host".
3. Tab A: click **Start** → both tabs show the scene with a 6→0 countdown.
4. After countdown: both tabs show prompt 1/8 with YES/NO and a per-prompt countdown.
5. Answer through all 8 prompts in both tabs → both land on Results with a round score + leaderboard.
6. Tab A: click **Next round** → loop repeats; leaderboard scores accumulate.

Expected: no console errors; scores accumulate across rounds; faster correct answers score higher.

- [ ] **Step 3: Verify host handoff**

Close Tab A (host). In Tab B, the lobby should now show Bob as host with a Start button on the next LOBBY broadcast (trigger by finishing/starting a round or rejoining).

Expected: Bob becomes host; the game remains playable.

- [ ] **Step 4: Verify the mobile layout**

In the browser, open device emulation (e.g. Chrome DevTools → toggle device toolbar →
iPhone) at a portrait phone size, or load `http://<your-lan-ip>:5174` on a real phone.
1. Join screen fits with no horizontal scroll; the nickname input does not trigger zoom
   on focus (iOS).
2. During QUIZ, the YES/NO buttons are large, split 50/50, and reachable with a thumb at
   the bottom of the screen; double-tapping a button does not zoom the page.
3. The scene fits within the viewport (no page scroll) during MEMORIZE; object positions
   look consistent.
4. Content clears notch/home-indicator safe areas (no clipping under a simulated notch).

Expected: clean single-column portrait play with no horizontal scroll or accidental zoom.

- [ ] **Step 5: Final commit**

```bash
cd memory-rush && git add -A && git commit -q -m "docs: verified end-to-end multiplayer loop" --allow-empty
```

---

## Self-Review Notes (addressed)

- **Spec coverage:** single shared room (Task 4 global `state`), host-press-Start (Task 3 `START` guard + Task 7 button), 6s memorize / 8 prompts / 4s each (Task 3 `DEFAULT_CONFIG`), speed+accuracy scoring (Task 3 `ANSWER`), SVG/emoji scenes (Task 2 + Task 6), nickname identity (Task 5/7 join), authoritative server timing (Task 3 injected `ctx`, Task 4 timers), join-mid-round waiting (Task 3 `JOIN`), disconnect/host reassignment (Task 3 `DISCONNECT`/`ensureHost`), Vitest tests (Task 3), mobile-first UI (Task 5 viewport meta + safe-area/touch-target CSS). All covered.
- **Mobile coverage:** `viewport-fit=cover` + safe-area insets, full-bleed phone layout capped to a centered column on desktop, ≥48px touch targets, split 50/50 thumb-reachable YES/NO buttons (≥64px), ≥16px inputs (no iOS auto-zoom), `touch-action: manipulation`, `100dvh` sizing, portrait-friendly scene aspect ratio, and `clamp()`-scaled type. Add mobile checks to Task 8 manual verification (test in a phone viewport / device emulation).
- **Type consistency:** message tag is `t` everywhere; `ServerMessage`/`ClientMessage` shapes match between `protocol.ts`, `game.ts`, `index.ts`, `net.ts`, `app.ts`. `PromptObject`/`SceneObject`/`SceneView` consistent across shared + client. Reducer returns `{ out, wakeAt }` consistently.
- **Placeholders:** none — all steps contain full code.
```
