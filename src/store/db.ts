import { create } from "zustand";
import { persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import {
  ACTIONS,
  applyPatch,
  CmdError,
  emptyData,
  makeSeed,
  roleIn as roleInData,
  SERVER_ONLY,
  withCtx,
  type ActionArgs,
  type ActionName,
  type ActionResult,
  type Data,
  type Patch,
} from "../shared/model";
import { api, ApiError, connectSocket, type Bootstrap, type ServerMessage } from "../lib/api";
import { personalWs } from "../lib/utils";
import { useUI } from "./ui";
import type { Role, User } from "../data/types";

export interface DBState extends Data {
  currentUserId: string | null;
  status: "loading" | "anon" | "ready";
  live: boolean;
  activeWs: string; // 'personal' | teamId
  theme: "light" | "dark";
  accent: string;
}

/** Optimistic commands: applied locally at once, confirmed (or rolled back) by the server. */
type Commands = { [K in Exclude<ActionName, "joinTeam" | "inviteMember">]: (...args: ActionArgs<K>) => ActionResult<K> };
/** Commands that need server-side data to compute — awaited. */
type ServerCommands = { [K in "joinTeam" | "inviteMember"]: (...args: ActionArgs<K>) => Promise<ActionResult<K>> };

export interface DBActions extends Commands, ServerCommands {
  init: () => Promise<void>;
  login: (id: string, password: string) => Promise<string | null>;
  register: (p: { name: string; email: string; username: string; password: string }) => Promise<string | null>;
  logout: () => Promise<void>;
  resync: () => Promise<void>;
  setTheme: (t: DBState["theme"]) => void;
  setAccent: (c: string) => void;
  setActiveWs: (ws: string) => void;
}

export type DB = DBState & DBActions;

/* ---------------- helpers ---------------- */

export function resolveWs(s: Pick<DBState, "activeWs" | "currentUserId">) {
  return s.activeWs === "personal" ? personalWs(s.currentUserId ?? "") : s.activeWs;
}

export function roleIn(s: Pick<DBState, "memberships" | "currentUserId">, wsId: string, userId = s.currentUserId ?? ""): Role | null {
  return roleInData(s, wsId, userId);
}

const toast = (msg: string) => useUI.getState().toast(msg);

let stopSocket: (() => void) | null = null;

/* ---------------- store ---------------- */

export const useDB = create<DB>()(
  persist(
    immer((set, get) => {
      const replaceData = (data: Data) =>
        set((s) => {
          Object.assign(s, data);
          // Leave a workspace we no longer belong to.
          if (s.activeWs !== "personal" && !data.memberships.some((m) => m.teamId === s.activeWs && m.userId === s.currentUserId)) s.activeWs = "personal";
        });

      const onPatch = (patch: Patch) =>
        set((s) => {
          applyPatch(s, patch);
          if (s.activeWs !== "personal" && !s.teams[s.activeWs]) s.activeWs = "personal";
        });

      const startSocket = () => {
        stopSocket?.();
        stopSocket = connectSocket({
          onMessage: (m: ServerMessage) => {
            if (m.type === "patch") onPatch(m.patch);
            else if (m.type === "snapshot") replaceData(m.data);
          },
          onStatus: (live) => set((s) => { s.live = live; }),
          onReconnect: () => void get().resync(),
          onUnauthorized: () => signedOut(),
        });
      };

      const signedIn = (b: Bootstrap) => {
        set((s) => {
          Object.assign(s, b.data);
          s.currentUserId = b.me;
          s.status = "ready";
          if (s.activeWs !== "personal" && !b.data.teams[s.activeWs]) s.activeWs = "personal";
        });
        startSocket();
      };

      const signedOut = () => {
        stopSocket?.();
        stopSocket = null;
        set((s) => {
          Object.assign(s, emptyData());
          s.currentUserId = null;
          s.status = "anon";
          s.live = false;
          s.activeWs = "personal";
        });
      };

      /** Run locally (optimistic), then send to the server with the same seed so ids match. */
      const optimistic = (name: ActionName) => (...args: unknown[]) => {
        const actor = get().currentUserId;
        if (!actor) return undefined;
        const seed = makeSeed();
        const now = Date.now();
        let result: unknown;
        try {
          set((s) => {
            result = withCtx({ actor, seed, now }, () => (ACTIONS[name] as (d: Data, ...a: unknown[]) => unknown)(s, ...args));
            if (s.activeWs !== "personal" && !s.memberships.some((m) => m.teamId === s.activeWs && m.userId === actor)) s.activeWs = "personal";
          });
        } catch (e) {
          if (e instanceof CmdError) {
            toast(e.message);
            return undefined;
          }
          throw e;
        }
        api
          .cmd(name, args, seed, now)
          .then((r) => {
            if (r.snapshot) replaceData(r.snapshot);
            else if (r.patch) onPatch(r.patch);
          })
          .catch((e: ApiError) => {
            if (e.status === 401) return signedOut();
            toast(e.status === 0 ? "You're offline — change not saved" : e.message);
            void get().resync();
          });
        return result;
      };

      const serverOnly = (name: ActionName) => async (...args: unknown[]) => {
        try {
          const r = await api.cmd(name, args, makeSeed(), Date.now());
          if (r.snapshot) replaceData(r.snapshot);
          else if (r.patch) onPatch(r.patch);
          return r.result;
        } catch (e) {
          const err = e as ApiError;
          if (err.status === 401) signedOut();
          return name === "joinTeam" ? { ok: false, message: err.message } : err.message;
        }
      };

      const commands = Object.fromEntries(
        (Object.keys(ACTIONS) as ActionName[]).map((n) => [n, SERVER_ONLY.includes(n) ? serverOnly(n) : optimistic(n)]),
      ) as unknown as Commands & ServerCommands;

      return {
        ...emptyData(),
        currentUserId: null,
        status: "loading",
        live: false,
        activeWs: "personal",
        theme: "light",
        accent: "#3FAF5A",
        ...commands,

        init: async () => {
          try {
            signedIn(await api.me());
          } catch {
            signedOut();
          }
        },
        login: async (id, password) => {
          try {
            signedIn(await api.login(id, password));
            set((s) => { s.activeWs = "personal"; });
            return null;
          } catch (e) {
            return (e as Error).message;
          }
        },
        register: async (p) => {
          try {
            signedIn(await api.register(p));
            set((s) => { s.activeWs = "personal"; });
            return null;
          } catch (e) {
            return (e as Error).message;
          }
        },
        logout: async () => {
          await api.logout().catch(() => undefined);
          signedOut();
        },
        resync: async () => {
          try {
            const b = await api.me();
            replaceData(b.data);
          } catch (e) {
            if ((e as ApiError).status === 401) signedOut();
          }
        },
        setTheme: (t) => set((s) => { s.theme = t; }),
        setAccent: (c) => set((s) => { s.accent = c; }),
        setActiveWs: (ws) => set((s) => { s.activeWs = ws; }),
      };
    }),
    {
      name: "kulii-prefs",
      version: 2,
      // Only device preferences live in the browser; all data comes from the server.
      partialize: (s) => ({ theme: s.theme, accent: s.accent, activeWs: s.activeWs }),
    },
  ),
);

try {
  localStorage.removeItem("kulii-db"); // data from the old local-only version
} catch {
  /* storage unavailable */
}

export type { User };
