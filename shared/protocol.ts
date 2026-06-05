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
