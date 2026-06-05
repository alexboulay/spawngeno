# Memory Rush — Design Spec

Date: 2026-06-05
Status: Approved

## Summary
A real-time, multiplayer, **mobile-first** browser-based memory challenge game. All
players join one shared room from their phones. Each round, the host starts a match: a
hand-drawn SVG scene is shown to everyone for a fixed memorize window, then the scene
disappears and players answer a series of quickfire "was this object present?" prompts.
Speed + accuracy are scored, and a cumulative leaderboard runs across rounds.

## Decisions (locked)
- **Content source:** bundled curated set (no external APIs, fully offline, deterministic).
- **Image style:** hand-drawn inline SVG scenes with declared object metadata.
- **Session model:** single shared room (one global game everyone joins).
- **Scoring style:** quickfire single-answer prompts (YES/NO), scored on speed + accuracy.
- **Stack:** Node + `ws` (WebSocket) server + Vite + TypeScript client.
- **Identity:** player enters a nickname on join; in-memory only, no accounts/persistence.
- **Round control:** first player is host and presses **Start** for each round.
- **Target device:** mobile-first. The primary experience is a phone in portrait; the
  layout is designed for small touch screens first and scales up gracefully to desktop.

## Architecture
Single project folder `memory-rush/` with three parts and one root `package.json`:

```
memory-rush/
  shared/
    protocol.ts   # all WS message types (client <-> server contract)
    scenes.ts     # scene definitions: present[] objects + decoys[] pool
  server/
    game.ts       # pure-ish room state machine (testable core)
    index.ts      # ws wiring + timers
  client/
    index.html
    src/
      net.ts      # typed WS client wrapper with auto-reconnect
      app.ts      # screen router / state held client-side
      screens/    # join, lobby, memorize, quiz, results
      scenes/     # renders an SVG scene from scene data
```

- `shared/` is imported by both sides via plain relative imports (no package linking).
- Server runs in dev with `tsx`; client runs under Vite. `npm run dev` starts both
  concurrently. Client connects to the `ws` server on a fixed port.
- **The server is authoritative**: it owns the clock, active scene, prompt sequence,
  and all scoring. Clients send only `JOIN`, `START` (host), `ANSWER`. The server
  timestamps answer arrival, so speed scoring cannot be spoofed by the client.

## Game state machine (single room)
States: `LOBBY -> MEMORIZE -> QUIZ -> RESULTS -> LOBBY ...`

- **LOBBY:** players listed with nicknames. First-connected player is host and sees a
  Start button; others see "waiting for host". If host disconnects, host role passes
  to the next player. Empty room resets to LOBBY.
- **MEMORIZE:** on host `START`, server picks a random scene and broadcasts
  `MEMORIZE { scene, endsAt }`. Memorize window ~6s. Clients render the SVG scene and a
  countdown.
- **QUIZ:** server runs a sequence of **8 prompts**. Each prompt is a single object
  ("Was there a 🌂 umbrella?") broadcast as `PROMPT { index, total, object, endsAt }`
  with ~4s deadline. Players send `ANSWER { index, value: boolean }`. Server advances to
  the next prompt early if all active players have answered, otherwise on deadline.
  After each prompt the server may broadcast `PROMPT_RESULT { index, correctAnswer }`.
- **RESULTS:** server broadcasts `RESULTS { roundScores, leaderboard }`. Returns to
  LOBBY; host can start the next round.

## Scenes
3-4 inline SVG scenes (e.g. Living Room, Park, Kitchen). Each scene declares:
- `present[]` — objects actually drawn in the SVG (correct YES answers), each with a
  label + emoji/icon for prompts.
- `decoys[]` — plausible objects NOT in the scene (correct NO answers).

Each round the server builds 8 prompts by sampling a mix of `present` + `decoys`, so the
correct answer (YES vs NO) varies prompt to prompt. Sampling is server-side and random
per round.

## Scoring
Per prompt:
- Correct answer: `100 + speedBonus`, where `speedBonus` is up to `+100`, linear with
  fraction of time remaining when the answer arrived (server-measured).
- Wrong answer or timeout: `0`.

All scores are non-negative (feels rewarding). Per-round score = sum across its 8
prompts. Leaderboard = cumulative across rounds, held in memory for the session.

## Network protocol (message shapes)
Client -> Server:
- `JOIN { nick }`
- `START` (host only; ignored otherwise)
- `ANSWER { index, value: boolean }`

Server -> Client:
- `WELCOME { playerId, isHost }`
- `LOBBY { players: [{id, nick, score, isHost}], hostId, phase }`
- `MEMORIZE { scene, endsAt }`
- `PROMPT { index, total, object, endsAt }`
- `PROMPT_RESULT { index, correctAnswer }`
- `RESULTS { roundScores, leaderboard }`
- `ERROR { message }`

All deadlines are server timestamps (`endsAt` in ms). Clients render countdowns from
them; the server remains the source of truth for timing and scoring.

## Mobile UI
The client is designed phone-first; desktop is a graceful scale-up, not the target.
- **Viewport:** `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`.
- **Layout:** single-column, portrait-oriented. Content max-width caps on larger screens
  but defaults to full-bleed on phones. Respect safe-area insets (notches/home bar) via
  `env(safe-area-inset-*)`.
- **Touch targets:** all interactive elements ≥ 44px tall. The QUIZ YES/NO buttons are
  large, full-width (or split 50/50), thumb-reachable near the bottom of the screen.
- **No accidental zoom/scroll:** inputs use ≥16px font (avoids iOS auto-zoom); disable
  double-tap zoom on game controls; the active game screen fits without page scrolling.
- **Scene rendering:** the SVG scene scales to viewport width with a fixed aspect ratio
  so object positions stay consistent across devices.
- **Feedback:** countdowns and correct/wrong flashes are large and high-contrast for
  glanceable play on a small screen.

## Edge cases
- **Join mid-round:** player lands in lobby list marked "waiting"; becomes scorable from
  the next round.
- **Disconnect:** player removed; host reassigned to next player if the host left.
- **All answered early:** server advances the prompt immediately.
- **Empty room:** resets to LOBBY phase.
- **Duplicate nicknames:** allowed (optionally suffixed); not a hard error.

## Testing
- `server/game.ts` is structured as a reducer-like core: `(state, event) -> { state, outbound[] }`.
  Vitest unit tests cover scoring math, speed bonus, prompt advancement (deadline vs
  all-answered), host assignment/handoff, and join-mid-round behavior.
- Manual integration: open multiple browser tabs, run a full round, verify leaderboard.

## Defaults (tunable)
- Prompts per round: **8**
- Memorize window: **6s**
- Per-prompt deadline: **4s**
- Project name: **Memory Rush**

## Out of scope (YAGNI)
- Accounts, persistence, databases.
- Multiple concurrent rooms / room codes.
- AI-generated content or external image APIs.
- Spectator chat, emotes, sound (can be added later).
