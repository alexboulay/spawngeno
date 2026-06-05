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
