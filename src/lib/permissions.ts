import type { Role, Task } from "../data/types";

export type Action =
  | "team.delete"
  | "team.settings"
  | "member.invite"
  | "member.remove"
  | "member.role"
  | "project.create"
  | "project.edit"
  | "project.archive"
  | "task.create"
  | "task.edit"
  | "task.delete"
  | "task.assign"
  | "task.review"
  | "task.comment"
  | "vault.add"
  | "vault.edit"
  | "announce.create";

const MATRIX: Record<Role, Action[]> = {
  OWNER: [
    "team.delete", "team.settings", "member.invite", "member.remove", "member.role",
    "project.create", "project.edit", "project.archive",
    "task.create", "task.edit", "task.delete", "task.assign", "task.review", "task.comment",
    "vault.add", "vault.edit", "announce.create",
  ],
  ADMIN: [
    "member.invite", "project.create", "project.edit", "project.archive",
    "task.create", "task.edit", "task.delete", "task.assign", "task.review", "task.comment",
    "vault.add", "vault.edit", "announce.create",
  ],
  MEMBER: ["task.create", "task.edit", "task.comment", "vault.add"],
  VIEWER: [],
};

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MEMBER: "Member",
  VIEWER: "Viewer",
};

export const ROLE_DESC: Record<Role, string> = {
  OWNER: "Full control, including roles and deleting the team",
  ADMIN: "Manage tasks & projects, invite, assign, moderate",
  MEMBER: "Work on tasks, comment, upload attachments",
  VIEWER: "View only",
};

export interface PermCtx {
  role: Role | null; // null → not a member
  userId: string;
  membersCanCreateTasks?: boolean;
}

/** Central permission check. `task` narrows edit rights for members to their own tasks. */
export function can(ctx: PermCtx, action: Action, task?: Task): boolean {
  if (!ctx.role) return false;
  if (!MATRIX[ctx.role].includes(action)) return false;
  if (ctx.role === "MEMBER") {
    if (action === "task.create" && ctx.membersCanCreateTasks === false) return false;
    if (action === "task.edit" && task) {
      return task.assigneeIds.includes(ctx.userId) || task.createdBy === ctx.userId;
    }
  }
  return true;
}

export function denyReason(ctx: PermCtx, action: Action): string {
  if (!ctx.role) return "You're not a member of this workspace";
  if (ctx.role === "VIEWER") return "Viewers have read-only access";
  if (action === "task.create" && ctx.membersCanCreateTasks === false) return "Only admins can create tasks here";
  return `Requires ${action.startsWith("team") || action.startsWith("member.r") ? "Owner" : "Admin"} role`;
}
