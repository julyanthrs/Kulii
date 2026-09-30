import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Columns3, List, Plus } from "lucide-react";
import { useDB } from "../store/db";
import { useActiveWorkspace, useMe, usePerm, useVisibleWsIds, useWsTasks } from "../store/hooks";
import { useUI } from "../store/ui";
import { Page, Segmented } from "../components/ui";
import { applyFilters, Board, emptyFilters, FilterBar, ListView, type Filters } from "../components/task/Views";

type Scope = "mine" | "everyone" | "all";

export default function Tasks() {
  const [params, setParams] = useSearchParams();
  const ws = useActiveWorkspace();
  const me = useMe();
  const perm = usePerm();
  const setNewTask = useUI((s) => s.setNewTask);
  const view = (params.get("view") as "board" | "list") ?? "board";
  const scope = (params.get("scope") as Scope) ?? (ws.team ? "mine" : "everyone");
  const [filters, setFilters] = useState<Filters>(() => ({ ...emptyFilters(), assignees: params.get("assignee") ? [params.get("assignee")!] : [] }));

  const wsTasks = useWsTasks();
  const allTasks = useDB((s) => s.tasks);
  const visible = useVisibleWsIds();

  const base = useMemo(() => {
    if (scope === "all") return Object.values(allTasks).filter((t) => visible.has(t.workspaceId) && !t.deletedAt && t.assigneeIds.includes(me.id));
    if (scope === "mine") return wsTasks.filter((t) => t.assigneeIds.includes(me.id));
    return wsTasks;
  }, [scope, allTasks, visible, wsTasks, me.id]);
  const tasks = useMemo(() => applyFilters(base, filters), [base, filters]);

  const set = (k: string, v: string) => {
    params.set(k, v);
    setParams(params, { replace: true });
  };

  const open = tasks.filter((t) => t.status !== "done").length;

  return (
    <Page
      title={scope === "mine" || scope === "all" ? "My Tasks" : "All Tasks"}
      sub={`${scope === "all" ? "Across all workspaces" : ws.name} · ${open} open · ${tasks.length - open} completed`}
      noScroll
      actions={
        <>
          <Segmented
            value={scope}
            onChange={(v) => set("scope", v)}
            options={[
              { value: "mine", label: "Assigned to me" },
              ...(ws.team ? [{ value: "everyone" as Scope, label: "Everyone" }] : []),
              { value: "all", label: "All workspaces" },
            ]}
          />
          <Segmented
            value={view}
            onChange={(v) => set("view", v)}
            options={[
              { value: "board", label: "Board", icon: <Columns3 size={13} /> },
              { value: "list", label: "List", icon: <List size={13} /> },
            ]}
          />
          <button className="btn primary" disabled={!perm.can("task.create")} title={perm.can("task.create") ? undefined : perm.why("task.create")} onClick={() => setNewTask({})}>
            <Plus size={14} /> Task
          </button>
        </>
      }
    >
      <FilterBar tasks={base} value={filters} onChange={setFilters} />
      <div style={{ flex: 1, minHeight: 0, overflow: view === "list" ? "auto" : "hidden", marginTop: 10, display: "flex", flexDirection: "column" }}>
        {view === "board" ? <Board tasks={tasks} /> : <ListView tasks={tasks} showWs={scope === "all"} />}
      </div>
    </Page>
  );
}
