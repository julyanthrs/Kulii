import { useState } from "react";
import { format } from "date-fns";
import { ArrowRight, Inbox as InboxIcon, Trash2 } from "lucide-react";
import { useDB } from "../store/db";
import { useMe, usePerm, useWorkspaces, useWsId, useWsProjects } from "../store/hooks";
import { useUI } from "../store/ui";
import { ago, PRIORITY_LABEL, PRIORITY_ORDER } from "../lib/utils";
import { Empty, Page } from "../components/ui";
import { AssigneePicker } from "../components/task/TaskBits";
import type { InboxItem, Priority } from "../data/types";

export default function InboxPage() {
  const me = useMe();
  const items = useDB((s) => s.inbox);
  const addInbox = useDB((s) => s.addInbox);
  const mine = items.filter((i) => i.userId === me.id);
  const [v, setV] = useState("");

  return (
    <Page title="Inbox" sub="Capture now, organize later. Nothing here is visible to your teams.">
      <div className="inbox-capture glass-float">
        <InboxIcon size={18} className="muted" />
        <input
          className="inline-input"
          autoFocus
          placeholder="What's on your mind? Press Enter to capture"
          value={v}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && v.trim()) {
              addInbox(v.trim());
              setV("");
            }
          }}
          style={{ fontSize: 15 }}
        />
        <span className="kbd">Enter</span>
      </div>
      <div className="label" style={{ margin: "20px 4px 8px" }}>To triage · {mine.length}</div>
      {mine.length === 0 ? (
        <Empty icon={<InboxIcon size={22} />} title="Inbox zero">Everything captured has been organized.</Empty>
      ) : (
        <div className="stack" style={{ gap: 8 }}>
          {mine.map((i) => <InboxRow key={i.id} item={i} />)}
        </div>
      )}
    </Page>
  );
}

function InboxRow({ item }: { item: InboxItem }) {
  const me = useMe();
  const activeWs = useWsId();
  const workspaces = useWorkspaces().filter((w) => w.role !== "VIEWER");
  const [ws, setWs] = useState(workspaces.some((w) => w.wsId === activeWs) ? activeWs : workspaces[0].wsId);
  const projects = useWsProjects(ws);
  const perm = usePerm(ws);
  const convertInbox = useDB((s) => s.convertInbox);
  const removeInbox = useDB((s) => s.removeInbox);
  const toast = useUI((s) => s.toast);
  const openTask = useUI((s) => s.openTask);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(item.text);
  const [f, setF] = useState({ projectId: "", priority: "medium" as Priority, due: "", assignees: [me.id] });

  const convert = () => {
    if (!perm.can("task.create")) return toast(perm.why("task.create"));
    const id = convertInbox(item.id, {
      title: title.trim() || item.text, workspaceId: ws, projectId: f.projectId || null, priority: f.priority,
      dueDate: f.due ? new Date(f.due).toISOString() : null, assigneeIds: f.assignees,
    });
    toast("Converted to task", { label: "Open", run: () => openTask(id) });
  };

  return (
    <div className="card" style={{ padding: 10 }}>
      <div className="row">
        <span className="inbox-dot" />
        <input className="inline-input grow" value={title} onChange={(e) => setTitle(e.target.value)} style={{ fontWeight: 500 }} aria-label="Item title" />
        <span className="card-meta">{ago(item.at)}</span>
        <button className="btn sm" onClick={() => setOpen(!open)}>{open ? "Close" : "Organize"}</button>
        <button className="icon-btn sm" aria-label="Delete" onClick={() => removeInbox(item.id)}><Trash2 size={13} /></button>
      </div>
      {open && (
        <div className="triage">
          <label className="field">
            <span>Workspace</span>
            <select className="select" value={ws} onChange={(e) => { setWs(e.target.value); setF({ ...f, projectId: "", assignees: [me.id] }); }}>
              {workspaces.map((w) => <option key={w.wsId} value={w.wsId}>{w.name}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Project</span>
            <select className="select" value={f.projectId} onChange={(e) => setF({ ...f, projectId: e.target.value })}>
              <option value="">No project</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Priority</span>
            <select className="select" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value as Priority })}>
              {PRIORITY_ORDER.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Deadline</span>
            <input type="datetime-local" className="input" value={f.due} min={format(new Date(), "yyyy-MM-dd'T'00:00")} onChange={(e) => setF({ ...f, due: e.target.value })} />
          </label>
          <div className="field">
            <span>Assignee</span>
            <AssigneePicker wsId={ws} value={f.assignees} onChange={(a) => setF({ ...f, assignees: a })} />
          </div>
          <div className="field" style={{ justifyContent: "flex-end" }}>
            <button className="btn primary" onClick={convert} disabled={!perm.can("task.create")}>Convert to task <ArrowRight size={13} /></button>
          </div>
        </div>
      )}
    </div>
  );
}
