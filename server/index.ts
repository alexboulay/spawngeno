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
