# Spawngeno — Gameplay Rewrite Design

Date: 2026-06-05
Status: Proposed
Supersedes: the gameplay portions of `2026-06-05-memory-rush-design.md`
Source of truth: `docs/claire/Spawngeno_Creative_Brief.md` (v1.0)

## Summary

Replace the "Memory Rush" gameplay (static SVG scene → memorize → YES/NO prompts) with
**Spawngeno**: a real-time, multiplayer, mobile-first **visual-memory** game set in deep
space. Players join one shared room. The host starts a single continuous session that
auto-runs through **5 zones × 4 rounds = 20 rounds** of escalating difficulty.

Each round has two phases:

1. **Memorize** — **K = 3 + round** space objects (round 1 = 4, +1 per round) **scroll
   across the screen**, each on its own card. The player observes and memorizes all of
   them.
2. **Select** — a larger stream of objects (the K memorized ones **+ distractor objects
   that were not shown**) **scrolls across the screen**, each on a card. The player **taps
   the items they memorized**, as fast as possible. Faster correct taps score more; a wrong
   tap scores 0 and breaks the streak.

Every object — in both phases — rides on a solid **deep-navy card** (`#1E1B4B`) with a neon
outline, so the void/starfield background never blends into the image being memorized.

After each zone, the lowest-scoring players are eliminated. Last Scout standing wins.

The existing architecture (Node + `ws` + Vite + TypeScript, server-authoritative reducer
core) is kept. This is a gameplay + protocol + content rewrite, not an infra rewrite.

## Decisions (locked via brainstorming)

- **Scope:** full gameplay rewrite to the Spawngeno brief.
- **Round shape:** two phases per round — **Memorize** (recall set) then **Select**
  (recognition under time pressure). **Both phases scroll horizontally** across the screen.
- **Memorize set:** **K = 3 + round** items, scrolled past with **no decoys** — the player
  memorizes everything shown. Round 1 = 4, round 20 = 23.
- **Selection:** brief-faithful **scrolling stream** of the K memorized items + D
  distractors; tap the memorized ones as they pass.
- **Card rendering:** every object (both phases) sits on a solid **deep-navy card**
  (`#1E1B4B`) with a neon outline, isolating the sprite from the busy background.
- **Session flow:** host presses Start once; server **auto-runs** all 20 rounds to a
  winner.
- **Scoring curve:** **continuous linear** by reaction time, ×streak, ×legendary.
- **Wrong tap:** 0 points, **breaks streak**, no point subtraction.
- **Difficulty scaling:** grounded in human-memory benchmarks (see Scaling).
- **Visuals:** themed **placeholders** — emoji/glyph sprites, neon outline, per-zone
  palette. Real pixel-art slots in later behind the same object data model.
- **Audio:** **Web Audio API** synth SFX (correct/wrong/portal/eliminate/countdown) plus a
  simple looping background pad per zone. Mutable. No asset files.
- **Small lobbies:** **not** specially handled (brief's delayed-elimination rule is
  discarded — hackathon scope).

## Difficulty scaling (human-memory benchmarks)

Anchors used to set the numbers:

- **Visual working memory ≈ 3–4 objects** held reliably (Cowan's "magic number 4"; Luck &
  Vogel). → **Round 1 memorize = 4 sits right at capacity**: a fair baseline.
- **Subitizing limit = 4** — up to 4 items are grasped at a glance; beyond that, effort
  rises sharply.
- **Verbal span 7±2 (Miller)** — higher, but visual-object span is lower (~4).
- **Recognition ≫ recall** — choosing seen items from a pool is far easier than recalling
  them cold, so the *selection* (recognition) format keeps higher counts fair.
- **Encoding time** — reliable encoding for later recognition ≈ 0.4–0.7 s per item.

`memorize = 3 + round` **deliberately exceeds human capacity** as zones escalate (5, 6, …,
23) — that is the point: it guarantees mistakes and drives eliminations ("Zone 3:
paranoia"). The benchmarks tune the *supporting* numbers so each round is hard-but-fair and
readable on a phone:

| Round | Memorize `K = 3+r` | Memorize time `K × perItem` | Distractors `D ≈ ⌈K/2⌉` (cap 12) | Selection stream `K + D` | Selection window |
| :---- | :----------------- | :-------------------------- | :------------------------------- | :----------------------- | :--------------- |
| 1     | 4                  | ~2.8 s (700 ms/item)        | 2                                | 6                        | ~10 s            |
| 5     | 8                  | ~4.8 s (600 ms/item)        | 4                                | 12                       | ~8 s             |
| 10    | 13                 | ~6.5 s (500 ms/item)        | 7                                | 20                       | ~7 s             |
| 15    | 18                 | ~8.1 s (450 ms/item)        | 9                                | 27                       | ~6 s             |
| 20    | 23                 | ~9.2 s (400 ms/item)        | 12                               | 35                       | ~5 s             |

- **Memorize time** = `K × perItem(zone)`, clamped to `[2000, 12000] ms`; `perItem` shrinks
  per zone for pressure.
- **Distractors** `D = min(12, ceil(K / 2))`; selection window follows the per-zone timer
  (≈ brief 10/8/7/6/5 s). All values live in `zones.ts` and are tunable.

## Game model

### Session lifecycle

```
LOBBY
  → for each of 20 rounds:
      ROUND_MEMORIZE  (show K items, memorizeMs)
      ROUND_SELECT    (K + D objects scroll; players tap memorized ones)
      ROUND_RESULT    (per-round scores + leaderboard)
      [every 4th round] ZONE_RESULT (eliminate bottom %, portal transition)
  → GAME_OVER (winner)
  → LOBBY (host can start a new session)
```

The server owns the clock, the per-round memorize set, the selection scroll schedule, and
all scoring. Clients send only `JOIN`, `START` (host), `TAP`.

### A round in detail

1. **Memorize:** server picks `K = 3 + round` distinct objects from the current zone's
   available pool, rarity-weighted toward salient anchors (Compass frequent; rare/epic/
   legendary favored over common noise so the set is memorable). It builds a **memorize
   schedule** — the K objects, each on a card, with staggered `enterAt`/`exitAt` timestamps
   and a `lane` — and broadcasts `MEMORIZE { schedule, endsAt }`. Clients animate the cards
   scrolling right→left (slower than the select phase, for encoding) with a countdown.
   Memorize is observe-only; taps are ignored.
2. **Select:** when memorize ends, the server reveals the **selection schedule**: a fixed
   list of card **instances** = the K memorized items **+ D distractor objects** (drawn
   from the zone pool, excluding the memorized set), each with an `enterAt`/`exitAt`
   timestamp, a vertical `lane`, and its object id. Broadcast `SELECT { schedule, endsAt }`.
   Clients animate the cards scrolling right→left (faster), keyed to the shared clock.
   Players tap.
3. **End:** the select phase ends when the last instance exits the screen (fixed stream).
   `endsAt` = last `exitAt`.
4. **Result:** server emits `ROUND_RESULT` (this round's scores + cumulative leaderboard).

### Tapping & scoring

- Client sends `TAP { roundId, instanceId }`. The **server timestamps arrival** and is
  authoritative (spoof-resistant, as today). Each instance scores at most once per player;
  re-taps are ignored.
- **Correct tap** (instance is one of the memorized K): compute
  `latency = clamp(tapArrival − enterAt, 0, window)`, `window = exitAt − enterAt` (the time
  that instance is on-screen / tappable). Then:
  - `base = max(100, round(1000 × (1 − latency / window)))`  *(continuous linear, 100 floor)*
  - `× streakMultiplier`
  - `× 2` if that object's rarity is **Legendary**
- **Wrong tap** (instance is a distractor): **0 points**, **streak resets to 0**, no
  subtraction; the instance is marked scored for that player (no re-tap farming).
- **Streak** (per player, across the session, resets on any wrong tap):
  ≥3 correct → ×1.2; ≥5 correct → ×1.5; else ×1.0.
- **Round score** = sum of that round's tap points. **Session score** = cumulative;
  leaderboard sorts by it. Tie-break: faster cumulative average reaction time.
- Server replies `TAP_RESULT { instanceId, correct, points, streakMult }` to the tapping
  player for immediate feedback.

### Elimination

After every 4th round (end of a zone), the server eliminates the bottom slice of **active**
players by cumulative score, per the brief's cut for that zone (Zones table). Eliminated
players become **spectators** (receive broadcasts, can't tap, can't score). The final zone
resolves to a single **winner**. Straight percentage; no small-lobby special-casing.

### Escalation

Each zone increases the memorize set (via the global round index), shortens encoding time,
increases distractors, speeds the scroll, shortens the selection window, and swaps the
color palette. The portal transition (flash + screen shake + SFX) plays at each
`ZONE_RESULT`.

## Object library (brief ch.04 — single source of truth)

`shared/objects.ts` exports `OBJECTS`, one row per object:
`{ id, name, glyph, rarity, zones: number[], speed, size }`.

- `rarity ∈ "common" | "rare" | "epic" | "legendary"` — drives memorize-set weighting and
  point weight (legendary ×2).
- `zones` lists which of zones 1–5 the object may appear in.
- `speed`, `size` are relative multipliers used by the scroll/render layer.
- `glyph` is a placeholder emoji; real pixel-art sprites replace it later without changing
  ids or consumers.

24 objects: 6 common, 8 rare, 4 epic, 6 legendary. Memorize sets favor rare/epic/legendary
(salient, memorable) with some common filler; distractors are drawn from the zone pool
excluding the current memorize set. **Portal** is reserved as the zone-transition visual,
not a memorize/select object. **Dark matter cloud** and **Danger zone marker** are flavor
entries in the data model, not required for the hackathon. (Exact glyphs live in the file
and are tunable.)

## Zones (brief ch.07 + ch.03)

`shared/zones.ts` exports `ZONES` (5 entries), each:
`{ index, name, palette, perItemMs, memorizeScrollMs, scrollMs, distractorCap, eliminationCut }`
with `roundsPerZone = 4`.

| Zone | Name        | Palette accent  | Cut       |
| :--- | :---------- | :-------------- | :-------- |
| 1    | Cyan nebula | Neon cyan       | 30%       |
| 2    | Purple void | Electric purple | 30%       |
| 3    | Pink storm  | Hot pink        | 35%       |
| 4    | Amber core  | Amber glow      | down to 2 |
| 5    | Red abyss   | Danger red      | 1 winner  |

`perItemMs` (memorize encoding budget per item, drives the memorize scroll duration via
`memorizeScrollMs` pacing) and `scrollMs` (per-instance on-screen window in select) shrink
per zone; `distractorCap` and scroll speed grow. Palette values come from the
base palette in brief ch.03, applied as CSS custom properties.

## Architecture

Same three-part layout and server-authoritative reducer.

```
shared/
  protocol.ts   # new Spawngeno message set
  objects.ts    # 24-object library + rarity (replaces scenes.ts)
  zones.ts      # 5 zone configs + palettes + scaling params
server/
  game.ts       # reducer: lifecycle, memorize-set + schedule gen, tap scoring, elimination
  index.ts      # ws wiring + timers (minor changes: TAP event, new phases)
client/
  index.html
  src/
    net.ts      # unchanged transport
    app.ts      # state + screen router
    scene.ts    # memorize scene + scrolling select field (CSS transforms from clock)
    screens.ts  # join / lobby / memorize / select-HUD / round-result / zone-result / game-over
    audio.ts    # Web Audio SFX + per-zone background pad (new)
    styles.css  # neon theme + per-zone palette variables
```

`shared/scenes.ts` is removed; `objects.ts` and `zones.ts` take its place.

### Server generation (deterministic, seedable)

On round start, the reducer builds from the injected `rng` (seedable for tests):
- **Memorize set + schedule:** `K = 3 + round` distinct objects, rarity-weighted,
  zone-constrained, laid out as scrolling cards (slower `memorizeScrollMs` pace).
- **Selection schedule:** the K items + `D = min(distractorCap, ceil(K/2))` distinct
  distractor objects (from the zone pool, excluding the memorize set). Each instance gets a
  staggered `enterAt`, `exitAt = enterAt + zone.scrollMs × object.speed`, and a `lane`.
Both schedules are sent up-front so every client animates an identical scene; the server
scores purely from the select-phase `enterAt`/`exitAt` and tap arrival time.

## Network protocol

Client → Server:
- `JOIN { nick }`
- `START` (host only; starts a full session from LOBBY/GAME_OVER)
- `TAP { roundId: number; instanceId: string }`

Server → Client:
- `WELCOME { playerId, isHost }`
- `LOBBY { phase, players: PlayerView[], hostId }`
- `MEMORIZE { zone, palette, round, totalRounds, schedule: Instance[], endsAt }`
- `SELECT { roundId, schedule: Instance[], startsAt, endsAt }`
- `TAP_RESULT { instanceId, correct, points, streakMult }` *(to the tapping player)*
- `ROUND_RESULT { round, roundScores: RoundScore[], leaderboard: PlayerView[] }`
- `ZONE_RESULT { zone, eliminated: PlayerView[], leaderboard: PlayerView[], nextZone | null }`
- `GAME_OVER { winner: PlayerView, leaderboard: PlayerView[] }`
- `SFX { event: "portal" | "correct" | "wrong" | "eliminate" | "countdown" }`
  *(may be folded into other messages; client also derives correct/wrong from `TAP_RESULT`)*
- `ERROR { message }`

`PlayerView` gains `eliminated: boolean` (spectator) alongside `score`, `isHost`,
`waiting`. `Instance = { instanceId, object: ObjectView, enterAt, exitAt, lane }`.
`ObjectView = { id, name, glyph, rarity }`. All timestamps are server epoch ms.

## Client rendering

- **Cards:** every object renders on a solid deep-navy (`#1E1B4B`) card with a neon outline
  and the glyph/sprite centered, so the void/starfield background never blends with the
  sprite. Cards are the unit that scrolls in both phases.
- **Memorize scene:** full-bleed dark void + parallax stars; the K cards scroll right→left
  (slower pace) via the shared clock, with a memorize countdown. Taps ignored.
- **Select scene:** scheduled card instances are absolutely-positioned and translated
  right→left between `enterAt`/`exitAt` via the shared clock (`requestAnimationFrame`).
  Tapping a card sends `TAP`; correct → green pop + SFX, wrong → red shake + streak break.
- **HUD (select):** live score, streak meter, round/zone indicator, players-remaining
  count, selection timer from `endsAt`. (No "find X" banner — the targets are whatever the
  player memorized.)
- **Theme:** per-zone palette injected as CSS custom properties on phase/zone change; neon
  outlines via `text-shadow`. Portal transition between zones = palette swap + flash + shake.
- **Mobile-first:** retains viewport/safe-area/≥44px-target rules; glyphs sized for thumbs;
  scenes fit without page scroll.

## Audio (`audio.ts`)

Web Audio API only, lazily started on first user gesture (mobile autoplay rules):
- SFX: `correct` (rising blip), `wrong` (buzz), `portal` (sweep), `eliminate` (descending
  sting), `countdown` (ticks in final seconds).
- Background: a simple looping oscillator pad whose character shifts per zone palette.
- HUD mute toggle gates all audio.

## Testing

`server/game.ts` stays a pure-ish reducer `(state, event, ctx) → { out, wakeAt }`. Vitest
covers:
- **Scoring:** linear curve endpoints (latency 0 → ~1000, latency = window → 100 floor),
  legendary ×2, wrong tap = 0.
- **Streak:** transitions at 3 (×1.2) and 5 (×1.5), reset on wrong tap.
- **Generation determinism:** same seed → identical memorize set + schedule; `K = 3 + round`;
  distractors disjoint from the memorize set; `D = min(cap, ceil(K/2))`.
- **Round/zone advancement:** 20 rounds, zone boundary every 4 rounds, memorize→select→
  result→(zone) timing.
- **Elimination:** correct bottom-slice cut per zone; eliminated players become spectators
  and stop scoring; final zone yields one winner.
- **Host/session:** host handoff on disconnect; join mid-session → spectator/waiting,
  scorable from the next session.
- Manual: multiple browser tabs, full 20-round session to a winner.

## Defaults (tunable)

- Zones: 5 · rounds per zone: 4 · total rounds: 20
- Memorize set: `K = 3 + globalRound` (round 1 → 4, round 20 → 23)
- Memorize time: `K × perItemMs(zone)`, clamped `[2000, 12000] ms`
- Distractors: `D = min(distractorCap, ceil(K / 2))`
- Base points: 1000 · floor: 100 · streak ×1.2 @3, ×1.5 @5 · legendary ×2
- Per-zone `perItemMs`, `scrollMs`, `distractorCap`, scroll speed: set in `zones.ts`,
  escalating

## Out of scope (hackathon / later workstreams)

- Real pixel-art sprite assets and music tracks (Design/Audio workstreams).
- Small-lobby delayed-elimination rule.
- Special legendary mechanics beyond ×2 scoring: dark-matter screen obscuring, danger-zone
  marker, victory-beacon double, Spawngeno-beacon easter egg (data-model placeholders only).
- Accounts, persistence, multiple rooms.
