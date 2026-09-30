import { useMemo } from "react";
import { useDB, resolveWs, roleIn } from "./db";
import type { Project, Role, Task, Team, User } from "../data/types";
import { can, denyReason, type Action } from "../lib/permissions";
import { isPersonalWs, personalWs } from "../lib/utils";

export function useMe(): User {
  const id = useDB((s) => s.currentUserId);
  const users = useDB((s) => s.users);
  return users[id ?? "u1"] ?? Object.values(users)[0];
}

export function useWsId() {
  const activeWs = useDB((s) => s.activeWs);
  const currentUserId = useDB((s) => s.currentUserId);
  return resolveWs({ activeWs, currentUserId });
}

export interface WorkspaceInfo {
  id: string; // 'personal' | teamId
  wsId: string; // resolved storage id
  name: string;
  icon: string;
  color: string;
  role: Role;
  team: Team | null;
}

export function useWorkspaces(): WorkspaceInfo[] {
  const me = useDB((s) => s.currentUserId) ?? "u1";
  const teams = useDB((s) => s.teams);
  const memberships = useDB((s) => s.memberships);
  return useMemo(() => {
    const list: WorkspaceInfo[] = [
      { id: "personal", wsId: personalWs(me), name: "Personal", icon: "user", color: "#8C877F", role: "OWNER", team: null },
    ];
    for (const m of memberships) {
      if (m.userId !== me) continue;
      const t = teams[m.teamId];
      if (t) list.push({ id: t.id, wsId: t.id, name: t.name, icon: t.icon, color: t.color, role: m.role, team: t });
    }
    return list;
  }, [me, teams, memberships]);
}

export function useActiveWorkspace(): WorkspaceInfo {
  const list = useWorkspaces();
  const active = useDB((s) => s.activeWs);
  return list.find((w) => w.id === active) ?? list[0];
}

export function usePerm(wsId?: string) {
  const active = useWsId();
  const ws = wsId ?? active;
  const memberships = useDB((s) => s.memberships);
  const currentUserId = useDB((s) => s.currentUserId) ?? "u1";
  const teams = useDB((s) => s.teams);
  return useMemo(() => {
    const role = roleIn({ memberships, currentUserId }, ws);
    const ctx = { role, userId: currentUserId, membersCanCreateTasks: isPersonalWs(ws) ? true : teams[ws]?.membersCanCreateTasks };
    return {
      role,
      can: (a: Action, t?: Task) => can(ctx, a, t),
      why: (a: Action) => denyReason(ctx, a),
    };
  }, [memberships, currentUserId, ws, teams]);
}

/** Every workspace id the current user can see. */
export function useVisibleWsIds() {
  const ws = useWorkspaces();
  return useMemo(() => new Set(ws.map((w) => w.wsId)), [ws]);
}

export function useWsTasks(wsId?: string) {
  const active = useWsId();
  const ws = wsId ?? active;
  const tasks = useDB((s) => s.tasks);
  return useMemo(() => Object.values(tasks).filter((t) => t.workspaceId === ws && !t.deletedAt), [tasks, ws]);
}

export function useWsProjects(wsId?: string, includeArchived = false) {
  const active = useWsId();
  const ws = wsId ?? active;
  const projects = useDB((s) => s.projects);
  return useMemo(
    () =>
      Object.values(projects)
        .filter((p) => p.workspaceId === ws && !p.deletedAt && (includeArchived || !p.archivedAt))
        .sort((a, b) => (a.deadline ?? "").localeCompare(b.deadline ?? "")),
    [projects, ws, includeArchived],
  );
}

export function useWsMembers(wsId?: string) {
  const active = useWsId();
  const ws = wsId ?? active;
  const memberships = useDB((s) => s.memberships);
  const users = useDB((s) => s.users);
  return useMemo(() => {
    if (isPersonalWs(ws)) {
      const u = users[ws.slice(2)];
      return u ? [{ user: u, role: "OWNER" as Role }] : [];
    }
    const order: Record<Role, number> = { OWNER: 0, ADMIN: 1, MEMBER: 2, VIEWER: 3 };
    return memberships
      .filter((m) => m.teamId === ws && users[m.userId])
      .map((m) => ({ user: users[m.userId], role: m.role }))
      .sort((a, b) => order[a.role] - order[b.role] || a.user.name.localeCompare(b.user.name));
  }, [memberships, users, ws]);
}

export function taskProgress(t: Task) {
  if (t.status === "done") return 1;
  if (!t.subtasks.length) return t.status === "review" ? 0.9 : t.status === "in_progress" ? 0.4 : 0;
  return t.subtasks.filter((s) => s.done).length / t.subtasks.length;
}

export function projectStats(p: Project, tasks: Task[]) {
  const list = tasks.filter((t) => t.projectId === p.id && !t.deletedAt);
  const done = list.filter((t) => t.status === "done").length;
  return { total: list.length, done, pct: list.length ? Math.round((done / list.length) * 100) : 0 };
}

export function isBlocked(t: Task, all: Record<string, Task>) {
  return t.status === "blocked" || t.blockedBy.some((id) => all[id] && all[id].status !== "done" && !all[id].deletedAt);
}

export function workload(userId: string, tasks: Task[]) {
  const active = tasks.filter((t) => t.assigneeIds.includes(userId) && t.status !== "done" && !t.deletedAt);
  const weekEnd = Date.now() + 7 * 86400_000;
  const dueSoon = active.filter((t) => t.dueDate && new Date(t.dueDate).getTime() < weekEnd).length;
  return { active: active.length, dueSoon };
}
