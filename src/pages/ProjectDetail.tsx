import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import { Archive, ArchiveRestore, ChevronRight, Columns3, ExternalLink, LayoutGrid, Link2, List, MoreHorizontal, Pencil, Plus, Trash2, X } from "lucide-react";
import { useDB, roleIn } from "../store/db";
import { projectStats, usePerm } from "../store/hooks";
import { useUI } from "../store/ui";
import { ago, domainOf, firstName, normalizeUrl, uid } from "../lib/utils";
import { Avatar, Bar, Empty, Menu, MenuItem, Page, Ring, Segmented } from "../components/ui";
import { applyFilters, Board, emptyFilters, FilterBar, ListView, type Filters } from "../components/task/Views";
import { QuickAdd } from "../components/task/TaskBits";
import { ServiceIcon } from "../components/icons";
import { projectHealth, ProjectModal } from "./Projects";

export default function ProjectDetail() {
  const { projectId = "" } = useParams();
  const project = useDB((s) => s.projects[projectId]);
  const allTasks = useDB((s) => s.tasks);
  const users = useDB((s) => s.users);
  const vault = useDB((s) => s.vault);
  const activity = useDB((s) => s.activity);
  const memberships = useDB((s) => s.memberships);
  const currentUserId = useDB((s) => s.currentUserId);
  const activeWs = useDB((s) => s.activeWs);
  const setActiveWs = useDB((s) => s.setActiveWs);
  const archiveProject = useDB((s) => s.archiveProject);
  const trashProject = useDB((s) => s.trashProject);
  const restoreProject = useDB((s) => s.restoreProject);
  const updateProject = useDB((s) => s.updateProject);
  const toast = useUI((s) => s.toast);
  const nav = useNavigate();
  const perm = usePerm(project?.workspaceId);
  const [view, setView] = useState<"overview" | "board" | "list">("board");
  const [filters, setFilters] = useState<Filters>(emptyFilters());
  const [editing, setEditing] = useState(false);
  const [link, setLink] = useState({ label: "", url: "" });

  const wsKey = project ? (project.workspaceId.startsWith("p:") ? "personal" : project.workspaceId) : null;
  useEffect(() => {
    if (wsKey && activeWs !== wsKey) setActiveWs(wsKey);
  }, [wsKey, activeWs, setActiveWs]);

  const tasks = useMemo(() => Object.values(allTasks).filter((t) => t.projectId === projectId && !t.deletedAt), [allTasks, projectId]);
  const filtered = useMemo(() => applyFilters(tasks, filters), [tasks, filters]);

  if (!project || project.deletedAt || !roleIn({ memberships, currentUserId }, project.workspaceId)) return <Navigate to="/projects" replace />;

  const s = projectStats(project, tasks);
  const h = projectHealth(project, s.pct);
  const items = Object.values(vault).filter((v) => v.projectId === projectId && !v.deletedAt);
  const feed = activity.filter((a) => a.projectId === projectId || (a.taskId && allTasks[a.taskId]?.projectId === projectId)).slice(0, 20);
  const canEdit = perm.can("project.edit");

  return (
    <Page
      crumbs={<><Link to="/projects">Projects</Link><ChevronRight size={11} /><span>{project.name}</span></>}
      title={
        <span className="row" style={{ gap: 10 }}>
          {project.name}
          {project.archivedAt && <span className="chip">Archived</span>}
        </span>
      }
      sub={project.description}
      noScroll
      actions={
        <>
          <div className="row hide-sm" style={{ gap: 10, marginRight: 6 }}>
            <Ring value={s.pct / 100} size={34} stroke={4} />
            <div>
              <div className="num" style={{ fontWeight: 600 }}>{s.pct}%</div>
              <div className="card-meta num">{s.done}/{s.total} · <span className={`health-text ${h.cls}`}>{h.label}</span></div>
            </div>
          </div>
          <Segmented value={view} onChange={setView} options={[
            { value: "board", label: "Board", icon: <Columns3 size={13} /> },
            { value: "list", label: "List", icon: <List size={13} /> },
            { value: "overview", label: "Overview", icon: <LayoutGrid size={13} /> },
          ]} />
          {canEdit && (
            <Menu width={200} trigger={(p) => <button ref={p.ref} onClick={p.onClick} className="icon-btn solid" aria-label="Project options"><MoreHorizontal size={16} /></button>}>
              {(close) => (
                <>
                  <MenuItem icon={<Pencil size={14} />} onClick={() => { setEditing(true); close(); }}>Edit project</MenuItem>
                  <MenuItem icon={project.archivedAt ? <ArchiveRestore size={14} /> : <Archive size={14} />} onClick={() => {
                    archiveProject(project.id, !project.archivedAt);
                    toast(project.archivedAt ? "Project restored" : "Project archived — still searchable");
                    close();
                  }}>
                    {project.archivedAt ? "Unarchive" : "Archive"}
                  </MenuItem>
                  <div className="menu-sep" />
                  <MenuItem danger icon={<Trash2 size={14} />} onClick={() => {
                    trashProject(project.id);
                    toast("Project moved to Trash", { label: "Undo", run: () => restoreProject(project.id) });
                    nav("/projects");
                  }}>Move to Trash</MenuItem>
                </>
              )}
            </Menu>
          )}
        </>
      }
    >
      {view !== "overview" ? (
        <>
          <FilterBar tasks={tasks} value={filters} onChange={setFilters} hideProject
            right={perm.can("task.create") ? <div style={{ width: 260 }}><QuickAdd wsId={project.workspaceId} projectId={project.id} compact placeholder="Add to this project" /></div> : null} />
          <div style={{ flex: 1, minHeight: 0, overflow: view === "list" ? "auto" : "hidden", marginTop: 10, display: "flex", flexDirection: "column" }}>
            {view === "board" ? <Board tasks={filtered} projectId={project.id} /> : <ListView tasks={filtered} />}
          </div>
        </>
      ) : (
        <div style={{ overflow: "auto", flex: 1 }}>
          <div className="overview-grid">
            <section className="card">
              <div className="card-title" style={{ marginBottom: 12 }}>Details</div>
              <div className="props" style={{ marginTop: 0 }}>
                <span>Start</span><div>{project.startDate ? format(new Date(project.startDate), "MMM d, yyyy") : "—"}</div>
                <span>Deadline</span><div>{project.deadline ? format(new Date(project.deadline), "MMM d, yyyy") : "—"}</div>
                <span>Progress</span><div className="row" style={{ gap: 10 }}><div style={{ width: 140 }}><Bar value={s.pct / 100} accent /></div><span className="num">{s.pct}%</span></div>
                <span>Created</span><div className="row"><Avatar user={users[project.createdBy]} size={18} /> {users[project.createdBy]?.name} · {ago(project.createdAt)}</div>
              </div>
              <div className="label" style={{ margin: "16px 0 8px" }}>Members</div>
              <div className="stack" style={{ gap: 2 }}>
                {project.memberIds.map((id) => users[id]).filter(Boolean).map((u) => (
                  <div key={u.id} className="list-row" style={{ padding: "4px 6px" }}>
                    <Avatar user={u} size={24} presence /><span className="grow">{u.name}</span><span className="card-meta">{u.title}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="card">
              <div className="card-head">
                <div className="card-title"><Link2 size={14} /> Files & links</div>
                <Link to="/vault" className="card-meta">Open Vault</Link>
              </div>
              {items.length === 0 && project.links.length === 0 && <Empty title="No resources yet">Add links here, or tag Vault items with this project.</Empty>}
              {items.map((v) => (
                <a key={v.id} href={v.url} target="_blank" rel="noreferrer" className="list-row">
                  <ServiceIcon url={v.url} size={28} />
                  <div className="grow"><div className="ellipsis" style={{ fontWeight: 500 }}>{v.title}</div><div className="card-meta">{domainOf(v.url)} · Vault</div></div>
                  <ExternalLink size={13} className="faint" />
                </a>
              ))}
              {project.links.map((l) => (
                <div key={l.id} className="list-row">
                  <ServiceIcon url={l.url} size={28} />
                  <a className="grow" href={l.url} target="_blank" rel="noreferrer"><div className="ellipsis" style={{ fontWeight: 500 }}>{l.label}</div><div className="card-meta">{domainOf(l.url)}</div></a>
                  {canEdit && <button className="icon-btn sm" aria-label="Remove link" onClick={() => updateProject(project.id, { links: project.links.filter((x) => x.id !== l.id) })}><X size={13} /></button>}
                </div>
              ))}
              {perm.can("task.comment") && (
                <div className="row" style={{ marginTop: 10 }}>
                  <input className="input" placeholder="Label" style={{ width: 120 }} value={link.label} onChange={(e) => setLink({ ...link, label: e.target.value })} />
                  <input className="input" placeholder="https://…" value={link.url} onChange={(e) => setLink({ ...link, url: e.target.value })} />
                  <button className="icon-btn solid" aria-label="Add link" disabled={!link.url.trim()} onClick={() => {
                    updateProject(project.id, { links: [...project.links, { id: uid("l"), label: link.label.trim() || domainOf(link.url), url: normalizeUrl(link.url) }] });
                    setLink({ label: "", url: "" });
                  }}><Plus size={14} /></button>
                </div>
              )}
            </section>

            <section className="card" style={{ gridColumn: "1 / -1" }}>
              <div className="card-title" style={{ marginBottom: 8 }}>Activity</div>
              {feed.length === 0 && <div className="card-meta">No activity yet.</div>}
              {feed.map((a) => (
                <div key={a.id} className="list-row" style={{ padding: "5px 6px" }}>
                  <Avatar user={users[a.actorId]} size={20} />
                  <div className="grow" style={{ fontSize: 12.5 }}><b style={{ fontWeight: 600 }}>{firstName(users[a.actorId]?.name ?? "")}</b> <span className="muted">{a.text}</span></div>
                  <span className="card-meta">{ago(a.at)}</span>
                </div>
              ))}
            </section>
          </div>
        </div>
      )}
      <ProjectModal open={editing} onClose={() => setEditing(false)} project={project} />
    </Page>
  );
}
