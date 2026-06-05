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
