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
        setMyId(msg.playerId);
        view.isHost = msg.isHost;
        if (view.screen === "JOIN") view.screen = "LOBBY";
        break;
      case "LOBBY":
        view.players = msg.players;
        view.isHost = playerIsHostForUs(view, msg);
        if (view.screen !== "JOIN" && msg.phase === "LOBBY") view.screen = "LOBBY";
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

// We track our own playerId (from WELCOME) so LOBBY host changes resolve correctly.
let myId: string | null = null;

function playerIsHostForUs(_view: View, msg: Extract<ServerMessage, { t: "LOBBY" }>): boolean {
  return myId !== null && msg.hostId === myId;
}

export function setMyId(id: string) {
  myId = id;
}
