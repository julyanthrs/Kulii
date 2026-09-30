import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Archive, ArchiveRestore, FolderKanban, Link2, ListChecks, RotateCcw, Search, Trash2 } from "lucide-react";
import { useDB } from "../store/db";
import { projectStats, useVisibleWsIds } from "../store/hooks";
import { useUI } from "../store/ui";
import { ago, shortDate } from "../lib/utils";
import { Empty, Page, Segmented } from "../components/ui";

export default function ArchivePage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "trash" ? "trash" : "archive";
  const [q, setQ] = useState("");
  const db = useDB();
  const visible = useVisibleWsIds();
  const toast = useUI((s) => s.toast);
  const openTask = useUI((s) => s.openTask);
  const wsName = (id: string) => (id.startsWith("p:") ? "Personal" : db.teams[id]?.name ?? "");
  const match = (s: string) => !q || s.toLowerCase().includes(q.toLowerCase());

  const archived = useMemo(
    () => Object.values(db.projects).filter((p) => visible.has(p.workspaceId) && p.archivedAt && !p.deletedAt && match(`${p.name} ${p.description}`)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db.projects, visible, q],
  );
  const allTasks = Object.values(db.tasks);
  const archivedTasks = allTasks.filter((t) => !t.deletedAt && t.projectId && archived.some((p) => p.id === t.projectId) && match(t.title));

  const trash = {
    tasks: allTasks.filter((t) => visible.has(t.workspaceId) && t.deletedAt && match(t.title)),
    projects: Object.values(db.projects).filter((p) => visible.has(p.workspaceId) && p.deletedAt && match(p.name)),
    vault: Object.values(db.vault).filter((v) => visible.has(v.workspaceId) && v.deletedAt && match(v.title)),
  };
  const trashCount = trash.tasks.length + trash.projects.length + trash.vault.length;

  const forever = (fn: () => void, what: string) => {
    if (confirm(`Permanently delete ${what}? This can't be undone.`)) fn();
  };

  return (
    <Page
      title={tab === "trash" ? "Trash" : "Archive"}
      sub={tab === "trash" ? "Deleted items stay here until you remove them permanently" : "Completed projects — still searchable everywhere"}
      actions={
        <>
          <div className="search-field" style={{ width: 200 }}>
            <Search size={14} />
            <input className="input" placeholder={`Search ${tab}`} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Segmented value={tab} onChange={(v) => setParams(v === "trash" ? { tab: "trash" } : {})} options={[
            { value: "archive", label: "Archive", icon: <Archive size={13} /> },
            { value: "trash", label: `Trash ${trashCount || ""}`, icon: <Trash2 size={13} /> },
          ]} />
          {tab === "trash" && trashCount > 0 && (
            <button className="btn danger" onClick={() => forever(db.emptyTrash, `${trashCount} items`)}>Empty trash</button>
          )}
        </>
      }
    >
      {tab === "archive" ? (
        archived.length === 0 ? (
          <Empty icon={<Archive size={22} />} title="Nothing archived">Archive a finished project from its menu.</Empty>
        ) : (
          <div className="stack" style={{ maxWidth: 820 }}>
            {archived.map((p) => {
              const s = projectStats(p, allTasks);
              return (
                <div key={p.id} className="card row" style={{ gap: 12 }}>
                  <span className="tile" style={{ width: 36, height: 36, display: "grid", placeItems: "center" }}><FolderKanban size={16} className="muted" /></span>
                  <div className="grow">
                    <Link to={`/projects/${p.id}`} style={{ fontWeight: 600 }}>{p.name}</Link>
                    <div className="card-meta">{wsName(p.workspaceId)} · {s.done}/{s.total} tasks · archived {ago(p.archivedAt!)}</div>
                  </div>
                  <button className="btn sm" onClick={() => { db.archiveProject(p.id, false); toast(`${p.name} restored`); }}>
                    <ArchiveRestore size={13} /> Unarchive
                  </button>
                </div>
              );
            })}
            {q && archivedTasks.length > 0 && (
              <>
                <div className="label" style={{ margin: "10px 4px 0" }}>Tasks in archived projects</div>
                <div className="card" style={{ padding: 6 }}>
                  {archivedTasks.map((t) => (
                    <div key={t.id} className="list-row clickable" onClick={() => openTask(t.id)}>
                      <ListChecks size={14} className="muted" /><span className="grow">{t.title}</span><span className="card-meta">{db.projects[t.projectId!]?.name}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )
      ) : trashCount === 0 ? (
        <Empty icon={<Trash2 size={22} />} title="Trash is empty" />
      ) : (
        <div className="card" style={{ padding: 6, maxWidth: 820 }}>
          {trash.tasks.map((t) => (
            <TrashRow key={t.id} icon={<ListChecks size={14} />} title={t.title} meta={`Task · ${wsName(t.workspaceId)} · deleted ${shortDate(t.deletedAt)}`}
              onRestore={() => { db.restoreTask(t.id); toast("Task restored"); }} onDelete={() => forever(() => db.deleteTaskForever(t.id), `"${t.title}"`)} />
          ))}
          {trash.projects.map((p) => (
            <TrashRow key={p.id} icon={<FolderKanban size={14} />} title={p.name} meta={`Project · ${wsName(p.workspaceId)} · deleted ${shortDate(p.deletedAt)}`}
              onRestore={() => { db.restoreProject(p.id); toast("Project restored"); }} onDelete={() => forever(() => db.deleteProjectForever(p.id), `"${p.name}"`)} />
          ))}
          {trash.vault.map((v) => (
            <TrashRow key={v.id} icon={<Link2 size={14} />} title={v.title} meta={`Vault link · ${wsName(v.workspaceId)} · deleted ${shortDate(v.deletedAt)}`}
              onRestore={() => { db.restoreVault(v.id); toast("Link restored"); }} onDelete={() => forever(() => db.deleteVaultForever(v.id), `"${v.title}"`)} />
          ))}
        </div>
      )}
    </Page>
  );
}

function TrashRow({ icon, title, meta, onRestore, onDelete }: { icon: React.ReactNode; title: string; meta: string; onRestore: () => void; onDelete: () => void }) {
  return (
    <div className="list-row">
      <span className="muted">{icon}</span>
      <div className="grow">
        <div className="ellipsis" style={{ fontWeight: 500 }}>{title}</div>
        <div className="card-meta">{meta}</div>
      </div>
      <button className="btn sm" onClick={onRestore}><RotateCcw size={12} /> Restore</button>
      <button className="btn sm ghost danger" onClick={onDelete}>Delete permanently</button>
    </div>
  );
}
