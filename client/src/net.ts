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
