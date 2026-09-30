import type { Data, Patch } from "../shared/model";
import { accessToken } from "./supabase";

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
  const token = await accessToken();
  const headers: Record<string, string> = {};
  if (body) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError("Can't reach Kulii at this address — the dev server may have stopped or moved. Reload the page, or run npm run dev.", 0);
  }
  if (!res.headers.get("content-type")?.includes("application/json"))
    throw new ApiError("This address isn't serving the Kulii API — make sure you opened the URL printed by npm run dev.", res.status || 502);
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok === false) throw new ApiError(json.error ?? `Request failed (${res.status})`, res.status);
  return json as T;
}

export const api = {
  me: () => request<Bootstrap>("GET", "/api/me"),
  usernameAvailable: (u: string) =>
    request<{ ok: true; available: boolean }>("GET", `/api/username-available?u=${encodeURIComponent(u)}`).then((r) => r.available),
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
  let failures401 = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const open = () => {
    if (stopped) return;
    ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
    ws.onopen = async () => {
      // First frame authenticates the socket with the current Supabase access token.
      ws?.send(JSON.stringify({ type: "auth", token: await accessToken() }));
    };
    ws.onmessage = (e) => {
      let m: ServerMessage;
      try {
        m = JSON.parse(e.data);
      } catch {
        return;
      }
      if (m.type === "hello") {
        handlers.onStatus(true);
        if (attempt > 0) handlers.onReconnect();
        attempt = 0;
        failures401 = 0;
      }
      handlers.onMessage(m);
    };
    ws.onclose = (e) => {
      handlers.onStatus(false);
      if (stopped) return;
      if (e.code === 4001 && ++failures401 >= 3) return handlers.onUnauthorized();
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
