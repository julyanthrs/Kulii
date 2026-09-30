import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { ArrowDown, ArrowUp, ChevronDown, Filter, Plus, Search, Trash2, X } from "lucide-react";
import { endOfWeek, isToday, startOfDay } from "date-fns";
import type { Priority, Status, Task } from "../../data/types";
import { useDB } from "../../store/db";
import { usePerm } from "../../store/hooks";
import { useUI } from "../../store/ui";
import { cx, dueLabel, isOverdue, PRIORITY_ORDER, PRIORITY_RANK, STATUS_LABEL, STATUS_ORDER } from "../../lib/utils";
import { Avatar, AvatarStack, Checkbox, Empty, Menu, MenuItem, PriorityDot, StatusLabel } from "../ui";
import { TaskCardBody } from "./TaskBits";

/* ---------------- Filters ---------------- */

export type DueFilter = "overdue" | "today" | "week" | "none";
export interface Filters {
  q: string;
  assignees: string[];
  projects: string[];
  priorities: Priority[];
  statuses: Status[];
  due: DueFilter[];
  tags: string[];
}
export const emptyFilters = (): Filters => ({ q: "", assignees: [], projects: [], priorities: [], statuses: [], due: [], tags: [] });

export function applyFilters(tasks: Task[], f: Filters) {
  const q = f.q.trim().toLowerCase();
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 }).getTime();
  return tasks.filter((t) => {
    if (q && !`${t.title} ${t.description} ${t.tags.join(" ")}`.toLowerCase().includes(q)) return false;
    if (f.assignees.length && !t.assigneeIds.some((a) => f.assignees.includes(a))) return false;
    if (f.projects.length && !f.projects.includes(t.projectId ?? "none")) return false;
    if (f.priorities.length && !f.priorities.includes(t.priority)) return false;
    if (f.statuses.length && !f.statuses.includes(t.status)) return false;
    if (f.tags.length && !t.tags.some((x) => f.tags.includes(x))) return false;
    if (f.due.length) {
      const d = t.dueDate ? new Date(t.dueDate) : null;
      const ok = f.due.some((k) =>
        k === "none" ? !d : !d ? false : k === "overdue" ? isOverdue(t.dueDate, t.status) : k === "today" ? isToday(d) : d.getTime() >= startOfDay(new Date()).getTime() && d.getTime() <= weekEnd,
      );
      if (!ok) return false;
    }
    return true;
  });
}

const DUE_LABEL: Record<DueFilter, string> = { overdue: "Overdue", today: "Due today", week: "This week", none: "No due date" };

function MultiMenu<T extends string>({ label, options, value, onChange }: { label: string; options: { value: T; label: React.ReactNode }[]; value: T[]; onChange: (v: T[]) => void }) {
  return (
    <Menu
      align="start"
      width={220}
      trigger={(p) => (
        <button ref={p.ref} onClick={p.onClick} className={cx("chip-btn", value.length > 0 && "active")}>
          {label}
          {value.length > 0 && <span className="count num">{value.length}</span>}
          <ChevronDown size={12} className="muted" />
        </button>
      )}
    >
      {options.length === 0 && <div className="menu-label">Nothing to filter</div>}
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button key={o.value} className="menu-item" onClick={() => onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])}>
            <Checkbox on={on} size={15} />
            <span className="grow ellipsis">{o.label}</span>
          </button>
        );
      })}
    </Menu>
  );
}

export function FilterBar({ tasks, value, onChange, right, hideProject }: { tasks: Task[]; value: Filters; onChange: (f: Filters) => void; right?: React.ReactNode; hideProject?: boolean }) {
  const users = useDB((s) => s.users);
  const projects = useDB((s) => s.projects);
  const assigneeIds = useMemo(() => [...new Set(tasks.flatMap((t) => t.assigneeIds))], [tasks]);
  const projectIds = useMemo(() => [...new Set(tasks.map((t) => t.projectId ?? "none"))], [tasks]);
  const tags = useMemo(() => [...new Set(tasks.flatMap((t) => t.tags))].sort(), [tasks]);
  const active = value.assignees.length + value.projects.length + value.priorities.length + value.statuses.length + value.due.length + value.tags.length;

  return (
    <div className="filter-bar">
      <div className="search-field" style={{ width: 220 }}>
        <Search size={14} />
        <input className="input" placeholder="Filter tasks…" value={value.q} onChange={(e) => onChange({ ...value, q: e.target.value })} />
      </div>
      <Filter size={14} className="faint hide-sm" />
      <MultiMenu label="Assignee" value={value.assignees} onChange={(v) => onChange({ ...value, assignees: v })}
        options={assigneeIds.filter((id) => users[id]).map((id) => ({ value: id, label: <span className="row" style={{ gap: 6 }}><Avatar user={users[id]} size={18} />{users[id].name}</span> }))} />
      {!hideProject && (
        <MultiMenu label="Project" value={value.projects} onChange={(v) => onChange({ ...value, projects: v })}
          options={projectIds.map((id) => ({ value: id, label: id === "none" ? "No project" : projects[id]?.name ?? "—" }))} />
      )}
      <MultiMenu label="Priority" value={value.priorities} onChange={(v) => onChange({ ...value, priorities: v })}
        options={PRIORITY_ORDER.map((p) => ({ value: p, label: <PriorityDot p={p} withLabel /> }))} />
      <MultiMenu label="Status" value={value.statuses} onChange={(v) => onChange({ ...value, statuses: v })}
        options={STATUS_ORDER.map((s) => ({ value: s, label: <StatusLabel s={s} /> }))} />
      <MultiMenu label="Due" value={value.due} onChange={(v) => onChange({ ...value, due: v })}
        options={(Object.keys(DUE_LABEL) as DueFilter[]).map((d) => ({ value: d, label: DUE_LABEL[d] }))} />
      <MultiMenu label="Tags" value={value.tags} onChange={(v) => onChange({ ...value, tags: v })} options={tags.map((t) => ({ value: t, label: `#${t}` }))} />
      {(active > 0 || value.q) && (
        <button className="btn sm ghost" onClick={() => onChange(emptyFilters())}>
          <X size={12} /> Clear
        </button>
      )}
      <div className="grow" />
      {right}
    </div>
  );
}

/* ---------------- Kanban board ---------------- */

const COLUMNS: Status[] = ["todo", "in_progress", "review", "done"];

function DraggableCard({ task, disabled }: { task: Task; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id, disabled });
  const openTask = useUI((s) => s.openTask);
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cx("k-card", isDragging && "ghost", disabled && "locked")}
      onClick={() => openTask(task.id)}
      role="button"
      aria-label={task.title}
    >
      <TaskCardBody task={task} />
    </div>
  );
}

function Column({ status, tasks, canDrop, onAdd }: { status: Status; tasks: Task[]; canDrop: boolean; onAdd?: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: status, disabled: !canDrop });
  const perm = usePerm();
  return (
    <div ref={setNodeRef} className={cx("k-col", isOver && "over", status === "blocked" && "narrow")}>
      <div className="k-col-head">
        <StatusLabel s={status} />
        <span className="count num">{tasks.length}</span>
        <div className="grow" />
        {onAdd && perm.can("task.create") && (
          <button className="icon-btn sm" onClick={onAdd} aria-label={`Add to ${STATUS_LABEL[status]}`}>
            <Plus size={14} />
          </button>
        )}
      </div>
      <div className="k-col-body">
        {tasks.map((t) => (
          <DraggableCardWithPerm key={t.id} task={t} />
        ))}
        {tasks.length === 0 && <div className="k-empty">Drop tasks here</div>}
      </div>
    </div>
  );
}

function DraggableCardWithPerm({ task }: { task: Task }) {
  const perm = usePerm(task.workspaceId);
  return <DraggableCard task={task} disabled={!perm.can("task.edit", task)} />;
}

export function Board({ tasks, projectId }: { tasks: Task[]; projectId?: string | null }) {
  const setStatus = useDB((s) => s.setStatus);
  const all = useDB((s) => s.tasks);
  const toast = useUI((s) => s.toast);
  const setNewTask = useUI((s) => s.setNewTask);
  const perm = usePerm();
  const [dragId, setDragId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor));
  const hasBlocked = tasks.some((t) => t.status === "blocked");
  const cols = hasBlocked ? [...COLUMNS, "blocked" as Status] : COLUMNS;
  const sorted = (s: Status) =>
    tasks
      .filter((t) => t.status === s)
      .sort((a, b) => (s === "done" ? (b.completedAt ?? "").localeCompare(a.completedAt ?? "") : PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || (a.dueDate ?? "z").localeCompare(b.dueDate ?? "z")));

  const onEnd = (e: DragEndEvent) => {
    setDragId(null);
    const id = String(e.active.id);
    const to = e.over?.id as Status | undefined;
    const t = all[id];
    if (!t || !to || t.status === to) return;
    const p = permSnapshot(t.workspaceId);
    if (to === "done" && t.status === "review" && !p.review) return toast("Only owners and admins can approve reviews");
    const prev = t.status;
    setStatus(id, to);
    toast(`Moved to ${STATUS_LABEL[to]}`, { label: "Undo", run: () => setStatus(id, prev) });
  };

  return (
    <DndContext sensors={sensors} onDragStart={(e: DragStartEvent) => setDragId(String(e.active.id))} onDragEnd={onEnd} onDragCancel={() => setDragId(null)}>
      <div className="board">
        {cols.map((s) => (
          <Column key={s} status={s} tasks={sorted(s)} canDrop={perm.role !== "VIEWER"} onAdd={s !== "blocked" ? () => setNewTask({ status: s, projectId }) : undefined} />
        ))}
      </div>
      <DragOverlay dropAnimation={{ duration: 220, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }}>
        {dragId && all[dragId] ? (
          <div className="k-card lifted">
            <TaskCardBody task={all[dragId]} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

/** Non-hook permission snapshot for event handlers. */
function permSnapshot(wsId: string) {
  const s = useDB.getState();
  if (wsId.startsWith("p:")) return { review: true };
  const role = s.memberships.find((m) => m.teamId === wsId && m.userId === s.currentUserId)?.role;
  return { review: role === "OWNER" || role === "ADMIN" };
}

/* ---------------- List view ---------------- */

type SortKey = "title" | "assignee" | "status" | "priority" | "project" | "due";

export function ListView({ tasks, showWs }: { tasks: Task[]; showWs?: boolean }) {
  const users = useDB((s) => s.users);
  const projects = useDB((s) => s.projects);
  const teams = useDB((s) => s.teams);
  const bulkUpdate = useDB((s) => s.bulkUpdate);
  const bulkTrash = useDB((s) => s.bulkTrash);
  const restoreTask = useDB((s) => s.restoreTask);
  const openTask = useUI((s) => s.openTask);
  const toast = useUI((s) => s.toast);
  const perm = usePerm();
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "due", dir: 1 });
  const [sel, setSel] = useState<Set<string>>(new Set());

  const rows = useMemo(() => {
    const val = (t: Task): string | number => {
      switch (sort.key) {
        case "title": return t.title.toLowerCase();
        case "assignee": return users[t.assigneeIds[0]]?.name ?? "~";
        case "status": return STATUS_ORDER.indexOf(t.status);
        case "priority": return PRIORITY_RANK[t.priority];
        case "project": return projects[t.projectId ?? ""]?.name ?? "~";
        case "due": return t.dueDate ?? "9999";
      }
    };
    return [...tasks].sort((a, b) => {
      const x = val(a), y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [tasks, sort, users, projects]);

  const visibleSel = rows.filter((r) => sel.has(r.id)).map((r) => r.id);
  const allOn = rows.length > 0 && visibleSel.length === rows.length;
  const th = (key: SortKey, label: string) => (
    <th className="sortable" onClick={() => setSort({ key, dir: sort.key === key ? ((-sort.dir) as 1 | -1) : 1 })}>
      <span className="row" style={{ gap: 3 }}>
        {label}
        {sort.key === key && (sort.dir === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
      </span>
    </th>
  );

  if (!tasks.length) return <Empty title="No tasks match" icon={<Search size={20} />}>Try clearing a filter.</Empty>;

  return (
    <div className="list-wrap">
      {visibleSel.length > 0 && (
        <div className="bulk-bar">
          <b className="num">{visibleSel.length} selected</b>
          <Menu align="start" width={180} trigger={(p) => <button ref={p.ref} onClick={p.onClick} className="btn sm">Status <ChevronDown size={12} /></button>}>
            {(close) => STATUS_ORDER.map((s) => <MenuItem key={s} onClick={() => { bulkUpdate(visibleSel, { status: s }); close(); toast(`Updated ${visibleSel.length} tasks`); }}><StatusLabel s={s} /></MenuItem>)}
          </Menu>
          <Menu align="start" width={160} trigger={(p) => <button ref={p.ref} onClick={p.onClick} className="btn sm">Priority <ChevronDown size={12} /></button>}>
            {(close) => PRIORITY_ORDER.map((pr) => <MenuItem key={pr} onClick={() => { bulkUpdate(visibleSel, { priority: pr }); close(); }}><PriorityDot p={pr} withLabel /></MenuItem>)}
          </Menu>
          <button className="btn sm danger" disabled={!perm.can("task.delete")} onClick={() => {
            const ids = visibleSel;
            bulkTrash(ids);
            setSel(new Set());
            toast(`${ids.length} moved to Trash`, { label: "Undo", run: () => ids.forEach(restoreTask) });
          }}>
            <Trash2 size={12} /> Trash
          </button>
          <div className="grow" />
          <button className="icon-btn sm" onClick={() => setSel(new Set())} aria-label="Clear selection"><X size={13} /></button>
        </div>
      )}
      <table className="table">
        <thead>
          <tr>
            <th style={{ width: 34 }}>
              <Checkbox on={allOn} size={15} onChange={() => setSel(allOn ? new Set() : new Set(rows.map((r) => r.id)))} label="Select all" />
            </th>
            {th("title", "Task")}
            {th("assignee", "Assignee")}
            {th("status", "Status")}
            {th("priority", "Priority")}
            {th("project", showWs ? "Workspace / Project" : "Project")}
            {th("due", "Due")}
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => {
            const on = sel.has(t.id);
            return (
              <tr key={t.id} className={cx(on && "sel")} onClick={() => openTask(t.id)}>
                <td onClick={(e) => e.stopPropagation()}>
                  <Checkbox on={on} size={15} label={`Select ${t.title}`} onChange={() => { const n = new Set(sel); on ? n.delete(t.id) : n.add(t.id); setSel(n); }} />
                </td>
                <td style={{ maxWidth: 340 }}>
                  <div className="ellipsis" style={{ fontWeight: 500 }}>{t.title}</div>
                </td>
                <td>
                  <span className="row" style={{ gap: 6 }}>
                    <AvatarStack users={t.assigneeIds.map((id) => users[id])} max={3} size={20} />
                    {t.assigneeIds.length === 1 && <span className="muted">{users[t.assigneeIds[0]]?.name.split(" ")[0]}</span>}
                  </span>
                </td>
                <td><StatusLabel s={t.status} /></td>
                <td><PriorityDot p={t.priority} withLabel /></td>
                <td className="muted" style={{ maxWidth: 220 }}>
                  <span className="ellipsis" style={{ display: "block" }}>
                    {showWs && `${t.workspaceId.startsWith("p:") ? "Personal" : teams[t.workspaceId]?.name}${t.projectId ? " / " : ""}`}
                    {t.projectId ? projects[t.projectId]?.name : showWs ? "" : "—"}
                  </span>
                </td>
                <td className="num" style={{ color: isOverdue(t.dueDate, t.status) ? "var(--danger)" : "var(--text-2)" }}>{dueLabel(t.dueDate)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

