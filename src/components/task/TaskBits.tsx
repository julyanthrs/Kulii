import { useMemo, useState, type ReactNode } from "react";
import { CalendarClock, Check, Lock, MessageSquare, Paperclip, Plus, Repeat } from "lucide-react";
import type { Priority, Status, Task, User } from "../../data/types";
import { useDB } from "../../store/db";
import { isBlocked, taskProgress, usePerm, useWsMembers, useWsTasks, workload } from "../../store/hooks";
import { useUI } from "../../store/ui";
import { cx, dueLabel, isOverdue, PRIORITY_LABEL, PRIORITY_ORDER, STATUS_LABEL, STATUS_ORDER } from "../../lib/utils";
import { Avatar, AvatarStack, Checkbox, Menu, MenuItem, PriorityDot, StatusLabel } from "../ui";

/* ---------------- Compact row (widgets, lists) ---------------- */

export function TaskRow({ task, showProject = true, showWs, dense }: { task: Task; showProject?: boolean; showWs?: boolean; dense?: boolean }) {
  const users = useDB((s) => s.users);
  const projects = useDB((s) => s.projects);
  const teams = useDB((s) => s.teams);
  const all = useDB((s) => s.tasks);
  const setStatus = useDB((s) => s.setStatus);
  const openTask = useUI((s) => s.openTask);
  const toast = useUI((s) => s.toast);
  const perm = usePerm(task.workspaceId);
  const done = task.status === "done";
  const overdue = isOverdue(task.dueDate, task.status);
  const blocked = isBlocked(task, all);
  const project = task.projectId ? projects[task.projectId] : null;
  const wsName = task.workspaceId.startsWith("p:") ? "Personal" : teams[task.workspaceId]?.name;
  const canEdit = perm.can("task.edit", task);

  return (
    <div className={cx("list-row clickable")} style={dense ? { padding: "6px 6px" } : undefined} onClick={() => openTask(task.id)}>
      <Checkbox
        on={done}
        round
        label={`Mark "${task.title}" ${done ? "not done" : "done"}`}
        onChange={() => {
          if (!canEdit) return toast(perm.why("task.edit"));
          setStatus(task.id, done ? "todo" : "done");
          if (!done) toast(`Completed "${task.title}"`, { label: "Undo", run: () => setStatus(task.id, task.status) });
        }}
      />
      <div className="grow">
        <div className="ellipsis" style={{ fontWeight: 500, textDecoration: done ? "line-through" : undefined, color: done ? "var(--text-3)" : undefined }}>
          {task.title}
        </div>
        {!dense && (
          <div className="card-meta row" style={{ gap: 6, marginTop: 1 }}>
            {showWs && wsName && <span className="ellipsis">{wsName}</span>}
            {showWs && project && showProject && <span>·</span>}
            {showProject && project && <span className="ellipsis">{project.name}</span>}
            {(showProject && project) || showWs ? <span>·</span> : null}
            <span style={{ color: overdue ? "var(--danger)" : undefined, whiteSpace: "nowrap" }}>{dueLabel(task.dueDate)}</span>
            {task.recurrence && <Repeat size={11} />}
          </div>
        )}
      </div>
      {blocked && <Lock size={13} className="faint" aria-label="Blocked" />}
      <PriorityDot p={task.priority} />
      <AvatarStack users={task.assigneeIds.map((id) => users[id])} max={2} size={20} />
    </div>
  );
}

/* ---------------- Kanban card body ---------------- */

export function TaskCardBody({ task }: { task: Task }) {
  const users = useDB((s) => s.users);
  const projects = useDB((s) => s.projects);
  const all = useDB((s) => s.tasks);
  const overdue = isOverdue(task.dueDate, task.status);
  const blocked = isBlocked(task, all);
  const subDone = task.subtasks.filter((s) => s.done).length;
  const project = task.projectId ? projects[task.projectId] : null;
  return (
    <>
      <div className="row" style={{ alignItems: "flex-start", gap: 8 }}>
        <PriorityDot p={task.priority} />
        <div className="grow" style={{ fontWeight: 500, lineHeight: 1.35, marginTop: -3 }}>
          {task.title}
        </div>
        {blocked && <Lock size={12} className="faint" style={{ marginTop: 1 }} />}
      </div>
      {project && <div className="card-meta ellipsis" style={{ margin: "4px 0 0 15px" }}>{project.name}</div>}
      <div className="row" style={{ marginTop: 10, gap: 8 }}>
        <AvatarStack users={task.assigneeIds.map((id) => users[id])} max={3} size={20} />
        <div className="grow" />
        {task.subtasks.length > 0 && (
          <span className="card-meta row num" style={{ gap: 3 }}>
            <Check size={11} />
            {subDone}/{task.subtasks.length}
          </span>
        )}
        {task.comments.length > 0 && (
          <span className="card-meta row num" style={{ gap: 3 }}>
            <MessageSquare size={11} />
            {task.comments.length}
          </span>
        )}
        {task.attachments.length > 0 && <Paperclip size={11} className="faint" />}
        {task.dueDate && (
          <span className="card-meta row" style={{ gap: 3, color: overdue ? "var(--danger)" : undefined }}>
            <CalendarClock size={11} />
            {dueLabel(task.dueDate).replace(/, .*/, "")}
          </span>
        )}
      </div>
      {task.subtasks.length > 0 && (
        <div className="bar" style={{ marginTop: 9, height: 3 }}>
          <i style={{ width: `${taskProgress(task) * 100}%`, background: "var(--accent)" }} />
        </div>
      )}
    </>
  );
}

/* ---------------- Quick add (instant create) ---------------- */

export function QuickAdd({
  wsId,
  projectId = null,
  placeholder = "Add task",
  dueDate = null,
  compact,
  onCreated,
}: {
  wsId: string;
  projectId?: string | null;
  placeholder?: string;
  dueDate?: string | null;
  compact?: boolean;
  onCreated?: (id: string) => void;
}) {
  const [v, setV] = useState("");
  const createTask = useDB((s) => s.createTask);
  const toast = useUI((s) => s.toast);
  const openTask = useUI((s) => s.openTask);
  const perm = usePerm(wsId);
  const allowed = perm.can("task.create");

  const submit = () => {
    const title = v.trim();
    if (!title) return;
    if (!allowed) return toast(perm.why("task.create"));
    // Lightweight syntax: "!high", "!urgent", "#tag", "today", "tomorrow"
    let priority: Priority = "medium";
    let due = dueDate;
    const tags: string[] = [];
    const clean = title
      .replace(/!(urgent|high|medium|low)\b/i, (_, p) => ((priority = p.toLowerCase() as Priority), ""))
      .replace(/#([\w-]+)/g, (_, t) => (tags.push(t), ""))
      .replace(/\b(today|tomorrow)\b/i, (m) => {
        const d = new Date();
        if (m.toLowerCase() === "tomorrow") d.setDate(d.getDate() + 1);
        d.setHours(17, 0, 0, 0);
        due = d.toISOString();
        return "";
      })
      .replace(/\s+/g, " ")
      .trim();
    const id = createTask({ title: clean || title, workspaceId: wsId, projectId, priority, dueDate: due, tags });
    setV("");
    toast("Task created", { label: "Open", run: () => openTask(id) });
    onCreated?.(id);
  };

  return (
    <div className="tile row" style={{ height: compact ? 34 : 40, padding: "0 6px 0 12px", borderRadius: 999, opacity: allowed ? 1 : 0.6 }}>
      <Plus size={15} className="muted" />
      <input
        className="inline-input"
        value={v}
        disabled={!allowed}
        placeholder={allowed ? placeholder : perm.why("task.create")}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        aria-label="Quick add task"
      />
      {v.trim() && (
        <button className="btn sm primary" onClick={submit}>
          Add
        </button>
      )}
    </div>
  );
}

/* ---------------- Pickers ---------------- */

export function StatusMenu({ value, onChange, disabled, children }: { value: Status; onChange: (s: Status) => void; disabled?: boolean; children?: ReactNode }) {
  return (
    <Menu
      align="start"
      width={190}
      trigger={(p) => (
        <button ref={p.ref} onClick={disabled ? undefined : p.onClick} className="chip-btn" disabled={disabled} style={disabled ? { cursor: "default" } : undefined}>
          {children ?? <StatusLabel s={value} />}
        </button>
      )}
    >
      {(close) =>
        STATUS_ORDER.map((s) => (
          <MenuItem key={s} end={s === value ? <Check size={13} /> : undefined} onClick={() => { onChange(s); close(); }}>
            <StatusLabel s={s} />
          </MenuItem>
        ))
      }
    </Menu>
  );
}

export function PriorityMenu({ value, onChange, disabled }: { value: Priority; onChange: (p: Priority) => void; disabled?: boolean }) {
  return (
    <Menu
      align="start"
      width={170}
      trigger={(p) => (
        <button ref={p.ref} onClick={disabled ? undefined : p.onClick} className="chip-btn" disabled={disabled} style={disabled ? { cursor: "default" } : undefined}>
          <PriorityDot p={value} withLabel />
        </button>
      )}
    >
      {(close) =>
        PRIORITY_ORDER.map((p) => (
          <MenuItem key={p} end={p === value ? <Check size={13} /> : undefined} onClick={() => { onChange(p); close(); }}>
            <PriorityDot p={p} withLabel />
          </MenuItem>
        ))
      }
    </Menu>
  );
}

/** Assignee picker shows each member's current workload — informational only. */
export function AssigneePicker({
  wsId,
  value,
  onChange,
  disabled,
  trigger,
}: {
  wsId: string;
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  trigger?: (p: { ref: React.RefObject<any>; onClick: (e: React.MouseEvent) => void }) => ReactNode;
}) {
  const members = useWsMembers(wsId);
  const tasks = useWsTasks(wsId);
  const loads = useMemo(() => Object.fromEntries(members.map((m) => [m.user.id, workload(m.user.id, tasks)])), [members, tasks]);
  const max = Math.max(1, ...Object.values(loads).map((l) => l.active));
  const users = useDB((s) => s.users);
  return (
    <Menu
      align="start"
      width={270}
      trigger={
        trigger ??
        ((p) => (
          <button ref={p.ref} onClick={disabled ? undefined : p.onClick} className="chip-btn" style={{ paddingLeft: value.length ? 4 : 10 }} disabled={disabled}>
            {value.length ? <AvatarStack users={value.map((id) => users[id])} max={4} size={20} /> : <span className="muted">Unassigned</span>}
            {!disabled && <Plus size={13} className="muted" />}
          </button>
        ))
      }
    >
      <div className="menu-label">Assign · current workload</div>
      {members
        .filter((m) => m.role !== "VIEWER")
        .map(({ user }) => {
          const on = value.includes(user.id);
          const l = loads[user.id];
          return (
            <button
              key={user.id}
              className="menu-item"
              onClick={() => onChange(on ? value.filter((x) => x !== user.id) : [...value, user.id])}
            >
              <Checkbox on={on} size={15} />
              <Avatar user={user} size={22} presence />
              <div className="grow">
                <div className="ellipsis">{user.name}</div>
                <div className="row" style={{ gap: 6, marginTop: 3 }}>
                  <div className="bar" style={{ width: 60, height: 3 }}>
                    <i style={{ width: `${(l.active / max) * 100}%`, background: l.active >= 7 ? "var(--p-high)" : "var(--text-2)" }} />
                  </div>
                  <span className="card-meta num">{l.active} active</span>
                </div>
              </div>
            </button>
          );
        })}
    </Menu>
  );
}

export function UserChip({ user }: { user?: User }) {
  if (!user) return null;
  return (
    <span className="row" style={{ gap: 6 }}>
      <Avatar user={user} size={20} />
      <span>{user.name}</span>
    </span>
  );
}

export const statusOptions = STATUS_ORDER.map((s) => ({ value: s, label: STATUS_LABEL[s] }));
export const priorityOptions = PRIORITY_ORDER.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }));
