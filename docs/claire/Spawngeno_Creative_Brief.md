

| CREATIVE BRIEF SPAWNGENO *See it. Remember it. Outlast them all.* Version 1.0  |  June 2026  |  Confidential |
| :---: |

| 01  OVERVIEW |
| :---- |

| What is Spawngeno? Spawngeno is a visual-memory elimination party game set in deep space. Players observe a scrolling 2D neon pixel-art scene filled with space objects, then race to answer questions about what they saw — testing attention, memory, and speed under pressure. After each zone, lowest-scoring players are eliminated. The last Scout standing wins. | Game DNA Kahoot's real-time quiz energy meets a space survival thriller. What separates Spawngeno: you earn answers through observation, not prior knowledge. Every wrong answer brings you closer to being left in the void. Platform: Mobile-first, multiplayer Players: 2 to 20+ per session Session: 20 rounds minimum (\~25–35 min) Style: 2D pixel art, neon, space |
| :---- | :---- |

| 02  VIBE & ATMOSPHERE |
| :---- |

**Spawngeno should feel like an event. Every portal jump is a moment. Every elimination is a spectacle.**

The aesthetic sits between a sci-fi blockbuster and a retro arcade — visually overwhelming in the best way, with music and sound design that make your heart race. The tone is epic and cinematic throughout.

| Soundtrack feel Synthwave / chiptune hybrid. Builds tension during observation, explodes on quiz reveal, dramatic sting on elimination. | Motion & pacing Objects move with weight and purpose. Portals tear open with screen-shake. Eliminated players get a cinematic void-drift exit sequence. | Emotional arc Zone 1: wonder. Zone 3: paranoia. Final: pure pressure. Each zone must feel harder, faster, more intense than the last. |
| :---- | :---- | :---- |

| 03  COLOR SYSTEM |
| :---- |

### **Base palette — shared across all roles (design, dev, product, audio)**

| Name | Hex | Swatch | Role |
| :---- | :---- | :---- | :---- |
| **Void black** | \#07071A |  | Background / space base |
| **Electric purple** | \#A78BFA |  | Primary brand, titles, portals |
| **Neon cyan** | \#6EE7F7 |  | UI accents, Zone 1, stars |
| **Hot pink** | \#F472B6 |  | Zone 3, alerts, meteors |
| **Amber glow** | \#FBBF24 |  | Zone 4, winner crown, rare objects |
| **Danger red** | \#F87171 |  | Elimination, wrong answers, final zone |
| **Pixel green** | \#4ADE80 |  | Correct answer, portal active state |
| **Deep navy** | \#1E1B4B |  | Card surfaces, mid-layer backgrounds |
| **Star white** | \#E2E8F0 |  | Text, small pixel stars, UI labels |

### **Zone color themes — each portal changes the full palette**

Every zone has its own dominant neon color applied to all UI elements, object outlines, and background atmosphere. This gives each zone a distinct emotional identity and signals clearly to players that the environment has changed.

| Zone 1 Cyan nebula | Zone 2 Purple void | Zone 3 Pink storm | Zone 4 Amber core | Final Red abyss |
| :---: | :---: | :---: | :---: | :---: |

| 04  OBJECT LIBRARY — 24 OBJECTS |
| :---- |

All objects exist in a shared data model used by both developers (spawn logic) and designers (sprite list). Rarity determines spawn frequency per zone and point weighting in quiz questions.

### **Common objects — always present, baseline visual noise**

| Object | Rarity | Description | Zone availability |
| :---- | :---- | :---- | :---- |
| **Small star** | **Common** | Background filler, vary in brightness and size | All zones |
| **Star cluster** | **Common** | Group of 3–5 stars moving together | All zones |
| **Meteor** | **Common** | Fast diagonal streak with a pixel trail | All zones |
| **Asteroid** | **Common** | Slow, chunky rock tumbling across the screen | All zones |
| **Comet** | **Common** | Bright head with a long glowing pixel tail | All zones |
| **Space debris** | **Common** | Small irregular grey/green pixel shards | All zones |

### **Rare objects — appear 1–3 times per zone, key quiz targets**

| Object | Rarity | Description | Zone availability |
| :---- | :---- | :---- | :---- |
| **Compass (boussole)** | **Rare** | The core landmark — always a quiz anchor | All zones |
| **Planet** | **Rare** | Large orb with pixel rings, color varies by zone | Zones 1–4 |
| **Black hole** | **Rare** | Swirling dark vortex with a pixel distortion ring | Zones 2–5 |
| **Satellite** | **Rare** | Mechanical object with a blinking pixel light | Zones 1–3 |
| **UFO** | **Rare** | Classic saucer shape, hovers briefly then exits | Zones 2–4 |
| **Space station** | **Rare** | Large modular structure, moves slowly | Zones 2–5 |
| **Nebula cloud** | **Rare** | Soft pixel fog cluster in zone color | All zones |
| **Crystal formation** | **Rare** | Geometric pixel cluster, drifts slowly | Zones 3–5 |

### **Epic objects — once per zone maximum, highest quiz value**

| Object | Rarity | Description | Zone availability |
| :---- | :---- | :---- | :---- |
| **Sun / star core** | **Epic** | Massive blazing orb, fills a third of the screen | Zones 3–5 |
| **Wormhole** | **Epic** | Spinning tunnel vortex, visually distinct from portal | Zones 2–5 |
| **Alien ship** | **Epic** | Large asymmetric vessel, moves in erratic path | Zones 3–5 |
| **Astronaut** | **Epic** | Pixel character floating alone — memorable, rare | All zones |

### **Legendary objects — portal-related or session-defining**

| Object | Rarity | Description | Zone availability |
| :---- | :---- | :---- | :---- |
| **Portal** | **Legendary** | Zone exit — swirling neon ring, always visually distinct | All zones |
| **Space artifact** | **Legendary** | Mysterious glowing relic — triggers a bonus question | Zones 2–5 |
| **Danger zone marker** | **Legendary** | Skull pixel icon — final zone only | Zone 5 only |
| **Victory beacon** | **Legendary** | Final round only — spotting it doubles your points | Final zone |
| **Spawngeno beacon** | **Legendary** | Hidden Easter egg — enormous score bonus | Random |
| **Dark matter cloud** | **Legendary** | Obscures part of the screen temporarily | Zones 4–5 |

| 05  GAME LOOP & ELIMINATION |
| :---- |

| 1 | Observation The scene scrolls across all screens simultaneously. Objects from the library appear at varying frequencies based on rarity. No pause, no replay — pure attention test. |
| :---: | :---- |
| **2** | **Portal jump** The portal object appears and triggers a cinematic zone transition — screen shake, color palette shift, dramatic audio sting. The quiz is about to begin. |
| **3** | **Quiz phase** Questions about what was just seen — counts, colors, sequences, positions. Speed \+ accuracy are both scored. Timer is visible to all players on screen. |
| **4** | **Elimination** Bottom N players are ejected with a cinematic void-drift sequence. They enter spectator mode. Remaining players see the updated count before the next zone begins. |
| **5** | **Escalation** Each zone is faster, contains more objects, and asks trickier questions. Rare and Epic objects are weighted more heavily in quizzes. Final zone is sudden death. |

### **Elimination track — example with 20 players**

After each zone, the lowest-scoring players are eliminated before the portal opens to the next zone. The cut percentage grows steeper as the game progresses.

| 20 players Zone 1 | 14 players Zone 2 | 9 players Zone 3 | 5 players Zone 4 | 1 winner Final |
| :---: | :---: | :---: | :---: | :---: |

*With only 3 players: elimination is delayed. No one is cut until zone 3 at the earliest, ensuring all players experience the full 20 rounds. The final zone becomes a 3-way sudden-death showdown.*

| 06  SCORING SYSTEM |
| :---- |

Spawngeno uses the same core scoring mechanic as Kahoot: points are awarded only for correct answers, and speed determines how many points you receive. A wrong answer scores zero — no penalty, but no reward.

### **Points by response time — base value: 1 000 pts per question**

| Response time | Points | Label | Color indicator |
| :---- | :---- | :---- | :---- |
| **0 – 1 sec** | **1 000 pts** | Maximum — lightning fast |  |
| **1 – 3 sec** | **800 pts** | Great — still very fast |  |
| **3 – 6 sec** | **550 pts** | Good — average reaction |  |
| **6 – 9 sec** | **300 pts** | Slow — but still correct |  |
| **9 – 10 sec** | **100 pts** | Last moment save |  |
| **Wrong / no answer** | **0 pts** | No reward, no penalty |  |

| BONUS RULES Streak bonus ×1.2: 3 correct answers in a row Streak bonus ×1.5: 5 correct answers in a row — resets on any wrong answer Legendary bonus ×2: All questions about Legendary objects are worth double base points Speed tie-break: If scores are equal at elimination, the faster average response time wins |
| :---- |

| 07  SESSION & ROUND STRUCTURE |
| :---- |

| 20 Minimum rounds per session | 5 Zones (4 rounds each) | \~30 min Average session length |
| :---: | :---: | :---: |

### **Zone breakdown**

| Zone | Rounds | Questions | Timer | Elimination cut | Color |
| :---- | :---- | :---- | :---- | :---- | :---- |
| **Zone 1 — Cyan nebula** | 4 rounds | 3 questions | 10 sec | **30%** |  |
| **Zone 2 — Purple void** | 4 rounds | 4 questions | 8 sec | **30%** |  |
| **Zone 3 — Pink storm** | 4 rounds | 4 questions | 7 sec | **35%** |  |
| **Zone 4 — Amber core** | 4 rounds | 5 questions | 6 sec | **Down to 2** |  |
| **Final — Red abyss** | 4 rounds | 5 questions | 5 sec | **1 winner** |  |

*Note: session length scales by player count. With fewer players, elimination is delayed to preserve the full experience.*

| 08  COMMON BASE FOR PARALLEL WORKSTREAMS |
| :---- |

All roles must align on the foundations in this document before splitting into parallel workstreams. This brief is the single source of truth. Any change to the foundations requires a brief update before implementation.

| Design | Color palette (chapter 03\) · Object sprite list — 24 objects (chapter 04\) · Zone color themes · Pixel art style guide (8px grid) · Neon 1px outline on all sprites · Font: pixel-style for scores/titles, clean sans for UI |
| :---: | :---- |
| **Development** | Object data model (id, name, rarity, zone, speed, size) · Rarity spawn weights per zone · Scroll engine (2D horizontal, configurable speed) · Quiz engine (question types: count, color, sequence, position) · Multiplayer session state · Elimination threshold logic · Scoring formula |
| **Product** | Core loop (chapter 05\) · Object library as single source of truth · Zone structure (5 zones, escalating difficulty) · Session config: player count, elimination %, zone count, questions per zone · Minimum 20 rounds guarantee |
| **Audio** | One ambient synthwave/chiptune track per zone matching zone palette · Event sounds: portal jump, correct answer, wrong answer, elimination sting, final countdown · All sounds triggered by game engine events — no hardcoded timing |

| SPAWNGENO *Last Scout Standing wins.* Confidential — Internal use only — Version 1.0 — June 2026 |
| :---: |

