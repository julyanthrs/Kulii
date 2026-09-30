import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { format, differenceInCalendarDays } from "date-fns";
import { CalendarRange, FolderKanban, Plus } from "lucide-react";
import { useDB } from "../store/db";
import { projectStats, useActiveWorkspace, useMe, usePerm, useWsId, useWsMembers, useWsProjects, useWsTasks } from "../store/hooks";
import { useUI } from "../store/ui";
import { AvatarStack, Checkbox, Empty, Modal, Page, Ring, Segmented, Avatar } from "../components/ui";
import type { Project } from "../data/types";

export function projectHealth(p: Project, pct: number) {
  if (pct === 100) return { label: "Complete", cls: "ok" };
  if (!p.deadline) return { label: "No deadline", cls: "" };
  const days = differenceInCalendarDays(new Date(p.deadline), new Date());
  if (days < 0) return { label: "Overdue", cls: "bad" };
  if (days <= 5 && pct < 75) return { label: "At risk", cls: "warn" };
  return { label: "On track", cls: "ok" };
}

export default function Projects() {
  const ws = useActiveWorkspace();
  const [tab, setTab] = useState<"active" | "archived">("active");
  const all = useWsProjects(undefined, true);
  const tasks = useWsTasks();
  const users = useDB((s) => s.users);
  const perm = usePerm();
  const [creating, setCreating] = useState(false);
  const list = all.filter((p) => (tab === "active" ? !p.archivedAt : p.archivedAt));

  return (
    <Page
      title="Projects"
      sub={`${ws.name} · ${all.filter((p) => !p.archivedAt).length} active`}
      actions={
        <>
          <Segmented value={tab} onChange={setTab} options={[{ value: "active", label: "Active" }, { value: "archived", label: `Archived ${all.filter((p) => p.archivedAt).length}` }]} />
          <button className="btn primary" disabled={!perm.can("project.create")} title={perm.can("project.create") ? undefined : perm.why("project.create")} onClick={() => setCreating(true)}>
            <Plus size={14} /> Project
          </button>
        </>
      }
    >
      {list.length === 0 ? (
        <Empty icon={<FolderKanban size={22} />} title={tab === "active" ? "No active projects" : "Nothing archived"}>
          {tab === "active" && perm.can("project.create") ? "Create one to group related tasks." : null}
        </Empty>
      ) : (
        <div className="grid-auto" style={{ ["--min" as string]: "300px" }}>
          {list.map((p) => {
            const s = projectStats(p, tasks);
            const h = projectHealth(p, s.pct);
            return (
              <Link key={p.id} to={`/projects/${p.id}`} className="card project-card">
                <div className="row" style={{ alignItems: "flex-start", gap: 12 }}>
                  <div className="grow">
                    <div style={{ fontWeight: 600, fontSize: 15 }} className="ellipsis">{p.name}</div>
                    <div className="muted clamp-2" style={{ fontSize: 12.5, marginTop: 3 }}>{p.description || "No description"}</div>
                  </div>
                  <Ring value={s.pct / 100} size={52} stroke={5} label={<b className="num" style={{ fontSize: 12 }}>{s.pct}%</b>} />
                </div>
                <div className="row" style={{ marginTop: 16 }}>
                  <AvatarStack users={p.memberIds.map((id) => users[id])} max={4} size={22} />
                  <div className="grow" />
                  <span className={`health ${h.cls}`}>{h.label}</span>
                </div>
                <div className="row card-meta" style={{ marginTop: 10 }}>
                  <CalendarRange size={12} />
                  {p.startDate ? format(new Date(p.startDate), "MMM d") : "—"} → {p.deadline ? format(new Date(p.deadline), "MMM d") : "—"}
                  <div className="grow" />
                  <span className="num">{s.done} / {s.total} tasks</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
      <ProjectModal open={creating} onClose={() => setCreating(false)} />
    </Page>
  );
}

export function ProjectModal({ open, onClose, project }: { open: boolean; onClose: () => void; project?: Project }) {
  const wsId = useWsId();
  const members = useWsMembers(project?.workspaceId ?? wsId);
  const me = useMe();
  const createProject = useDB((s) => s.createProject);
  const updateProject = useDB((s) => s.updateProject);
  const toast = useUI((s) => s.toast);
  const nav = useNavigate();
  const [f, setF] = useState({ name: "", description: "", start: "", deadline: "", memberIds: [me.id] as string[] });

  useEffect(() => {
    if (!open) return;
    setF(
      project
        ? {
            name: project.name, description: project.description, memberIds: project.memberIds,
            start: project.startDate ? format(new Date(project.startDate), "yyyy-MM-dd") : "",
            deadline: project.deadline ? format(new Date(project.deadline), "yyyy-MM-dd") : "",
          }
        : { name: "", description: "", start: format(new Date(), "yyyy-MM-dd"), deadline: "", memberIds: [me.id] },
    );
  }, [open, project, me.id]);

  const save = () => {
    if (!f.name.trim()) return;
    const data = {
      name: f.name.trim(), description: f.description.trim(), memberIds: f.memberIds,
      startDate: f.start ? new Date(`${f.start}T09:00`).toISOString() : null,
      deadline: f.deadline ? new Date(`${f.deadline}T23:59`).toISOString() : null,
    };
    if (project) {
      updateProject(project.id, data);
      toast("Project updated");
    } else {
      const id = createProject({ ...data, workspaceId: wsId });
      toast("Project created");
      nav(`/projects/${id}`);
    }
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={project ? "Edit project" : "New project"}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!f.name.trim()} onClick={save}>{project ? "Save" : "Create project"}</button></>}>
      <div className="stack">
        <input className="input" autoFocus placeholder="Project name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} style={{ height: 40, fontSize: 15, fontWeight: 500 }} />
        <textarea className="textarea" placeholder="Description" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <div className="field-row">
          <label className="field"><span>Start date</span><input type="date" className="input" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></label>
          <label className="field"><span>Deadline</span><input type="date" className="input" value={f.deadline} onChange={(e) => setF({ ...f, deadline: e.target.value })} /></label>
        </div>
        {members.length > 1 && (
          <div className="field">
            <span>Members</span>
            <div className="member-pick">
              {members.map(({ user }) => {
                const on = f.memberIds.includes(user.id);
                return (
                  <button key={user.id} className="list-row clickable" style={{ width: "100%", padding: "5px 6px" }}
                    onClick={() => setF({ ...f, memberIds: on ? f.memberIds.filter((x) => x !== user.id) : [...f.memberIds, user.id] })}>
                    <Checkbox on={on} size={15} />
                    <Avatar user={user} size={22} />
                    <span className="grow" style={{ textAlign: "left" }}>{user.name}</span>
                    <span className="card-meta">{user.title}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
