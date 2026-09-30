import { create } from "zustand";

export interface Toast {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}

interface UIState {
  openTaskId: string | null;
  paletteOpen: boolean;
  notificationsOpen: boolean;
  createTeamOpen: boolean;
  joinTeamOpen: boolean;
  inviteTeamId: string | null;
  newTaskOpen: { projectId?: string | null; dueDate?: string | null; status?: string } | null;
  toasts: Toast[];
  openTask: (id: string | null) => void;
  setPalette: (v: boolean) => void;
  setNotifications: (v: boolean) => void;
  setCreateTeam: (v: boolean) => void;
  setJoinTeam: (v: boolean) => void;
  setInvite: (teamId: string | null) => void;
  setNewTask: (v: UIState["newTaskOpen"]) => void;
  toast: (text: string, action?: Toast["action"]) => void;
  dismissToast: (id: number) => void;
}

let tid = 0;

export const useUI = create<UIState>((set, get) => ({
  openTaskId: null,
  paletteOpen: false,
  notificationsOpen: false,
  createTeamOpen: false,
  joinTeamOpen: false,
  inviteTeamId: null,
  newTaskOpen: null,
  toasts: [],
  openTask: (id) => set({ openTaskId: id }),
  setPalette: (v) => set({ paletteOpen: v }),
  setNotifications: (v) => set({ notificationsOpen: v }),
  setCreateTeam: (v) => set({ createTeamOpen: v }),
  setJoinTeam: (v) => set({ joinTeamOpen: v }),
  setInvite: (teamId) => set({ inviteTeamId: teamId }),
  setNewTask: (v) => set({ newTaskOpen: v }),
  toast: (text, action) => {
    const id = ++tid;
    set({ toasts: [...get().toasts, { id, text, action }] });
    setTimeout(() => get().dismissToast(id), action ? 5000 : 2600);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));
