import type { Data, Patch } from "../shared/model";

export interface Bootstrap {
  ok: true;
  me: string;
  data: Data;
}
export interface CmdResponse {
  ok: boolean;
  error?: string;
  result?: unknown;
  patch?: Patch;
  snapshot?: Data;
}

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      credentials: "same-origin",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("Can't reach the server", 0);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok === false) throw new ApiError(json.error ?? `Request failed (${res.status})`, res.status);
  return json as T;
}

export const api = {
  me: () => request<Bootstrap>("GET", "/api/me"),
  login: (id: string, password: string) => request<Bootstrap>("POST", "/api/auth/login", { id, password }),
  register: (p: { name: string; email: string; username: string; password: string }) => request<Bootstrap>("POST", "/api/auth/register", p),
  logout: () => request<{ ok: true }>("POST", "/api/auth/logout"),
  cmd: (name: string, args: unknown[], seed: string, now: number) => request<CmdResponse>("POST", "/api/cmd", { name, args, seed, now }),
};

/* ---------------- realtime socket with reconnect ---------------- */

export type ServerMessage = { type: "hello" } | { type: "patch"; patch: Patch } | { type: "snapshot"; data: Data };

export function connectSocket(handlers: {
  onMessage: (m: ServerMessage) => void;
  onStatus: (live: boolean) => void;
  onReconnect: () => void;
  onUnauthorized: () => void;
}) {
  let ws: WebSocket | null = null;
  let stopped = false;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const open = () => {
    if (stopped) return;
    ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
    ws.onopen = () => {
      handlers.onStatus(true);
      if (attempt > 0) handlers.onReconnect();
      attempt = 0;
    };
    ws.onmessage = (e) => {
      try {
        handlers.onMessage(JSON.parse(e.data));
      } catch {
        /* ignore malformed frames */
      }
    };
    ws.onclose = (e) => {
      handlers.onStatus(false);
      if (stopped) return;
      if (e.code === 4001) return handlers.onUnauthorized();
      attempt++;
      timer = setTimeout(open, Math.min(15_000, 500 * 2 ** Math.min(attempt, 5)));
    };
  };
  open();
  return () => {
    stopped = true;
    clearTimeout(timer);
    ws?.close();
  };
}
