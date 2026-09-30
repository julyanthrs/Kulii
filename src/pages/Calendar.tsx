import { useMemo, useState } from "react";
import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import {
  addDays,
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useDB } from "../store/db";
import { usePerm, useVisibleWsIds, useWorkspaces, useWsId } from "../store/hooks";
import { useUI } from "../store/ui";
import { cx } from "../lib/utils";
import { Empty, Page, PriorityDot, Segmented, StatusLabel } from "../components/ui";
import type { Task } from "../data/types";
import { can } from "../lib/permissions";
import { roleIn } from "../store/db";

type View = "month" | "week" | "agenda";
const dayKey = (d: Date) => format(d, "yyyy-MM-dd");

export default function Calendar() {
  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState(startOfDay(new Date()));
  const [scope, setScope] = useState<"all" | "ws">("all");
  const [dragId, setDragId] = useState<string | null>(null);
  const tasks = useDB((s) => s.tasks);
  const updateTask = useDB((s) => s.updateTask);
  const toast = useUI((s) => s.toast);
  const setNewTask = useUI((s) => s.setNewTask);
  const visible = useVisibleWsIds();
  const wsId = useWsId();
  const workspaces = useWorkspaces();
  const perm = usePerm();
  const colorOf = useMemo(() => Object.fromEntries(workspaces.map((w) => [w.wsId, w.color])), [workspaces]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const list = useMemo(
    () =>
      Object.values(tasks)
        .filter((t) => t.dueDate && !t.deletedAt && (scope === "all" ? visible.has(t.workspaceId) : t.workspaceId === wsId))
        .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!)),
    [tasks, scope, visible, wsId],
  );
  const byDay = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of list) {
      const k = dayKey(new Date(t.dueDate!));
      m.set(k, [...(m.get(k) ?? []), t]);
    }
    return m;
  }, [list]);

  const move = (n: number) =>
    setCursor(view === "month" ? addMonths(cursor, n) : view === "week" ? addWeeks(cursor, n) : addDays(cursor, n * 14));

  const onEnd = (e: DragEndEvent) => {
    setDragId(null);
    const t = tasks[String(e.active.id)];
    const key = e.over?.id ? String(e.over.id) : null;
    if (!t || !key || !t.dueDate) return;
    const s = useDB.getState();
    const role = roleIn(s, t.workspaceId);
    if (!can({ role, userId: s.currentUserId ?? "", membersCanCreateTasks: true }, "task.edit", t)) return toast("You can't reschedule this task");
    const old = new Date(t.dueDate);
    if (dayKey(old) === key) return;
    const [y, m, d] = key.split("-").map(Number);
    const next = new Date(old);
    next.setFullYear(y, m - 1, d);
    const prev = t.dueDate;
    updateTask(t.id, { dueDate: next.toISOString() });
    toast(`Moved to ${format(next, "EEE, MMM d")}`, { label: "Undo", run: () => updateTask(t.id, { dueDate: prev }) });
  };

  const title =
    view === "month"
      ? format(cursor, "MMMM yyyy")
      : view === "week"
        ? `${format(startOfWeek(cursor, { weekStartsOn: 1 }), "MMM d")} – ${format(endOfWeek(cursor, { weekStartsOn: 1 }), "MMM d, yyyy")}`
        : `From ${format(cursor, "MMM d")}`;

  return (
    <Page
      title="Calendar"
      sub={scope === "all" ? "Personal and team deadlines together" : "This workspace only"}
      noScroll
      actions={
        <>
          <Segmented value={scope} onChange={setScope} options={[{ value: "all", label: "All workspaces" }, { value: "ws", label: "This workspace" }]} />
          <Segmented value={view} onChange={setView} options={[{ value: "month", label: "Month" }, { value: "week", label: "Week" }, { value: "agenda", label: "Agenda" }]} />
        </>
      }
    >
      <div className="row" style={{ marginBottom: 10 }}>
        <button className="icon-btn solid" onClick={() => move(-1)} aria-label="Previous"><ChevronLeft size={16} /></button>
        <button className="icon-btn solid" onClick={() => move(1)} aria-label="Next"><ChevronRight size={16} /></button>
        <button className="btn sm" onClick={() => setCursor(startOfDay(new Date()))}>Today</button>
        <b style={{ fontSize: 15, marginLeft: 6 }}>{title}</b>
        <div className="grow" />
        <div className="row hide-sm" style={{ gap: 10 }}>
          {workspaces.filter((w) => scope === "all" || w.wsId === wsId).map((w) => (
            <span key={w.id} className="row card-meta" style={{ gap: 5 }}><i className="pdot" style={{ background: w.color }} />{w.name}</span>
          ))}
        </div>
      </div>

      <DndContext sensors={sensors} onDragStart={(e) => setDragId(String(e.active.id))} onDragEnd={onEnd} onDragCancel={() => setDragId(null)}>
        {view === "month" && <MonthGrid cursor={cursor} byDay={byDay} colorOf={colorOf} onAdd={perm.can("task.create") ? (d) => setNewTask({ dueDate: d.toISOString() }) : undefined} />}
        {view === "week" && <WeekGrid cursor={cursor} byDay={byDay} colorOf={colorOf} onAdd={perm.can("task.create") ? (d) => setNewTask({ dueDate: d.toISOString() }) : undefined} />}
        {view === "agenda" && <Agenda cursor={cursor} byDay={byDay} colorOf={colorOf} />}
        <DragOverlay dropAnimation={{ duration: 200, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }}>
          {dragId && tasks[dragId] ? <Chip task={tasks[dragId]} color={colorOf[tasks[dragId].workspaceId]} overlay /> : null}
        </DragOverlay>
      </DndContext>
    </Page>
  );
}

function Chip({ task, color, overlay, showTime }: { task: Task; color?: string; overlay?: boolean; showTime?: boolean }) {
  if (overlay) return <ChipView task={task} color={color} showTime={showTime} className="lifted" />;
  return <DraggableChip task={task} color={color} showTime={showTime} />;
}

function DraggableChip({ task, color, showTime }: { task: Task; color?: string; showTime?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  return <ChipView task={task} color={color} showTime={showTime} className={isDragging ? "ghost" : undefined} nodeRef={setNodeRef} dragProps={{ ...attributes, ...listeners }} />;
}

function ChipView({ task, color, showTime, className, nodeRef, dragProps }: {
  task: Task; color?: string; showTime?: boolean; className?: string; nodeRef?: (el: HTMLElement | null) => void; dragProps?: Record<string, unknown>;
}) {
  const openTask = useUI((s) => s.openTask);
  const done = task.status === "done";
  return (
    <div
      ref={nodeRef}
      {...dragProps}
      className={cx("cal-chip", done && "done", className)}
      style={{ ["--c" as string]: color ?? "var(--text-2)" }}
      onClick={(e) => { e.stopPropagation(); openTask(task.id); }}
      title={task.title}
    >
      <i />
      {showTime && <span className="num card-meta">{format(new Date(task.dueDate!), "h:mm")}</span>}
      <span className="ellipsis">{task.title}</span>
    </div>
  );
}

function DayCell({ date, tasks, colorOf, muted, onAdd, max = 3 }: { date: Date; tasks: Task[]; colorOf: Record<string, string>; muted?: boolean; onAdd?: (d: Date) => void; max?: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: dayKey(date) });
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? tasks : tasks.slice(0, max);
  return (
    <div ref={setNodeRef} className={cx("cal-cell", muted && "muted", isOver && "over", isToday(date) && "today")} onDoubleClick={() => onAdd?.(new Date(date.getFullYear(), date.getMonth(), date.getDate(), 17))}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="cal-date num">{format(date, "d")}</span>
        {onAdd && (
          <button className="icon-btn sm cal-add" aria-label={`Add task on ${format(date, "MMM d")}`} onClick={() => onAdd(new Date(date.getFullYear(), date.getMonth(), date.getDate(), 17))}>
            <Plus size={12} />
          </button>
        )}
      </div>
      <div className="cal-list">
        {shown.map((t) => <Chip key={t.id} task={t} color={colorOf[t.workspaceId]} />)}
        {tasks.length > max && (
          <button className="card-meta cal-more" onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}>
            {expanded ? "Show less" : `+${tasks.length - max} more`}
          </button>
        )}
      </div>
    </div>
  );
}

function MonthGrid({ cursor, byDay, colorOf, onAdd }: { cursor: Date; byDay: Map<string, Task[]>; colorOf: Record<string, string>; onAdd?: (d: Date) => void }) {
  const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });
  const days: Date[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  return (
    <div className="cal-month">
      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="cal-dow">{d}</div>)}
      {days.map((d) => (
        <DayCell key={dayKey(d)} date={d} tasks={byDay.get(dayKey(d)) ?? []} colorOf={colorOf} muted={!isSameMonth(d, cursor)} onAdd={onAdd} />
      ))}
    </div>
  );
}

function WeekGrid({ cursor, byDay, colorOf, onAdd }: { cursor: Date; byDay: Map<string, Task[]>; colorOf: Record<string, string>; onAdd?: (d: Date) => void }) {
  const start = startOfWeek(cursor, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return (
    <div className="cal-week">
      {days.map((d) => (
        <div key={dayKey(d)} className="cal-week-col">
          <div className={cx("cal-week-head", isToday(d) && "today")}>
            <span className="card-meta">{format(d, "EEE")}</span>
            <b className="num">{format(d, "d")}</b>
          </div>
          <WeekDrop date={d} tasks={byDay.get(dayKey(d)) ?? []} colorOf={colorOf} onAdd={onAdd} />
        </div>
      ))}
    </div>
  );
}

function WeekDrop({ date, tasks, colorOf, onAdd }: { date: Date; tasks: Task[]; colorOf: Record<string, string>; onAdd?: (d: Date) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: dayKey(date) });
  return (
    <div ref={setNodeRef} className={cx("cal-week-body", isOver && "over")} onDoubleClick={() => onAdd?.(new Date(date.getFullYear(), date.getMonth(), date.getDate(), 17))}>
      {tasks.map((t) => <Chip key={t.id} task={t} color={colorOf[t.workspaceId]} showTime />)}
      {onAdd && (
        <button className="cal-week-add" onClick={() => onAdd(new Date(date.getFullYear(), date.getMonth(), date.getDate(), 17))}>
          <Plus size={12} /> Add
        </button>
      )}
    </div>
  );
}

function Agenda({ cursor, byDay, colorOf }: { cursor: Date; byDay: Map<string, Task[]>; colorOf: Record<string, string> }) {
  const openTask = useUI((s) => s.openTask);
  const teams = useDB((s) => s.teams);
  const days = Array.from({ length: 30 }, (_, i) => addDays(cursor, i)).filter((d) => byDay.has(dayKey(d)));
  if (!days.length) return <Empty title="Nothing scheduled in the next 30 days" />;
  return (
    <div className="agenda">
      {days.map((d) => (
        <div key={dayKey(d)} className="agenda-day">
          <div className={cx("agenda-date", isToday(d) && "today")}>
            <b className="num">{format(d, "d")}</b>
            <span>{isSameDay(d, new Date()) ? "Today" : format(d, "EEE")}</span>
            <span className="card-meta">{format(d, "MMM")}</span>
          </div>
          <div className="grow stack" style={{ gap: 2 }}>
            {byDay.get(dayKey(d))!.map((t) => (
              <div key={t.id} className="list-row clickable" onClick={() => openTask(t.id)}>
                <i className="pdot" style={{ background: colorOf[t.workspaceId] }} />
                <span className="num card-meta" style={{ width: 58 }}>{format(new Date(t.dueDate!), "h:mm a")}</span>
                <span className="grow ellipsis" style={{ fontWeight: 500, textDecoration: t.status === "done" ? "line-through" : undefined }}>{t.title}</span>
                <span className="card-meta hide-sm">{t.workspaceId.startsWith("p:") ? "Personal" : teams[t.workspaceId]?.name}</span>
                <StatusLabel s={t.status} />
                <PriorityDot p={t.priority} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
