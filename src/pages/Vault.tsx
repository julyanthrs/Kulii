import { useEffect, useMemo, useState } from "react";
import {
  Copy,
  ExternalLink,
  FolderInput,
  LayoutGrid,
  Library,
  List,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Star,
  Trash2,
} from "lucide-react";
import { useDB } from "../store/db";
import { useActiveWorkspace, useMe, usePerm, useWsId, useWsProjects } from "../store/hooks";
import { useUI } from "../store/ui";
import { ago, cx, domainOf, firstName, shortDate } from "../lib/utils";
import { Avatar, Empty, Menu, MenuItem, Modal, Page, Segmented, Toggle } from "../components/ui";
import { detectService, ServiceIcon } from "../components/icons";
import type { VaultItem } from "../data/types";
import { DEFAULT_VAULT_CATEGORIES } from "../data/seed";

export default function Vault() {
  const ws = useActiveWorkspace();
  const wsId = useWsId();
  const me = useMe();
  const perm = usePerm();
  const vault = useDB((s) => s.vault);
  const users = useDB((s) => s.users);
  const projectsMap = useDB((s) => s.projects);
  const categories = useDB((s) => s.vaultCategories[wsId] ?? DEFAULT_VAULT_CATEGORIES);
  const addVaultCategory = useDB((s) => s.addVaultCategory);
  const updateVault = useDB((s) => s.updateVault);
  const trashVault = useDB((s) => s.trashVault);
  const restoreVault = useDB((s) => s.restoreVault);
  const projects = useWsProjects();
  const toast = useUI((s) => s.toast);

  const [view, setView] = useState<"grid" | "list">(() => {
    try { return localStorage.getItem("kulii-vault-view") === "list" ? "list" : "grid"; } catch { return "grid"; }
  });
  const [cat, setCat] = useState<string>("All");
  const [project, setProject] = useState<string>("");
  const [favOnly, setFavOnly] = useState(false);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<VaultItem | "new" | null>(null);
  const [newCat, setNewCat] = useState<string | null>(null);

  useEffect(() => {
    try { localStorage.setItem("kulii-vault-view", view); } catch { /* ignore */ }
  }, [view]);

  const items = useMemo(() => Object.values(vault).filter((v) => v.workspaceId === wsId && !v.deletedAt), [vault, wsId]);
  const pinned = items.filter((v) => v.pinned);
  const shown = items
    .filter((v) => (cat === "All" || v.category === cat) && (!project || v.projectId === project) && (!favOnly || v.favorite))
    .filter((v) => !q || `${v.title} ${v.url} ${v.description} ${v.tags.join(" ")} ${v.notes}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.at.localeCompare(a.at));
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const v of items) c[v.category] = (c[v.category] ?? 0) + 1;
    return c;
  }, [items]);

  const canEditItem = (v: VaultItem) => perm.can("vault.edit") || (perm.can("vault.add") && v.addedBy === me.id);

  const copy = (v: VaultItem) => {
    navigator.clipboard?.writeText(v.url);
    toast("Link copied");
  };

  const ItemMenu = ({ v }: { v: VaultItem }) => (
    <Menu width={210} trigger={(p) => (
      <button ref={p.ref} onClick={(e) => { e.preventDefault(); p.onClick(e); }} className="icon-btn sm" aria-label="Link options"><MoreHorizontal size={15} /></button>
    )}>
      {(close) => (
        <>
          <MenuItem icon={<ExternalLink size={14} />} onClick={() => { window.open(v.url, "_blank", "noopener"); close(); }}>Open</MenuItem>
          <MenuItem icon={<Copy size={14} />} onClick={() => { copy(v); close(); }}>Copy link</MenuItem>
          {canEditItem(v) && (
            <>
              <MenuItem icon={<Pencil size={14} />} onClick={() => { setEditing(v); close(); }}>Edit</MenuItem>
              <MenuItem icon={v.pinned ? <PinOff size={14} /> : <Pin size={14} />} onClick={() => { updateVault(v.id, { pinned: !v.pinned }); close(); }}>{v.pinned ? "Unpin" : "Pin to top"}</MenuItem>
              <div className="menu-label">Move to category</div>
              {categories.filter((c) => c !== v.category).map((c) => (
                <MenuItem key={c} icon={<FolderInput size={14} />} onClick={() => { updateVault(v.id, { category: c }); toast(`Moved to ${c}`); close(); }}>{c}</MenuItem>
              ))}
              <div className="menu-sep" />
              <MenuItem danger icon={<Trash2 size={14} />} onClick={() => {
                trashVault(v.id);
                toast("Link moved to Trash", { label: "Undo", run: () => restoreVault(v.id) });
                close();
              }}>Delete</MenuItem>
            </>
          )}
        </>
      )}
    </Menu>
  );

  const Fav = ({ v }: { v: VaultItem }) => (
    <button className={cx("icon-btn sm fav", v.favorite && "on")} aria-label={v.favorite ? "Unfavorite" : "Favorite"}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); updateVault(v.id, { favorite: !v.favorite }); }}>
      <Star size={14} fill={v.favorite ? "currentColor" : "none"} />
    </button>
  );

  return (
    <Page
      title="Vault"
      sub={ws.team ? `${ws.name}'s shared resource hub · ${items.length} links` : `Your private links · only you can see these`}
      actions={
        <>
          <div className="search-field" style={{ width: 210 }}>
            <Search size={14} />
            <input className="input" placeholder="Search the Vault" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Segmented value={view} onChange={setView} options={[{ value: "grid", label: "", icon: <LayoutGrid size={14} /> }, { value: "list", label: "", icon: <List size={14} /> }]} />
          <button className="btn primary" disabled={!perm.can("vault.add")} title={perm.can("vault.add") ? undefined : perm.why("vault.add")} onClick={() => setEditing("new")}>
            <Plus size={14} /> Add link
          </button>
        </>
      }
    >
      {pinned.length > 0 && (
        <>
          <div className="label" style={{ margin: "2px 4px 8px" }}>Pinned</div>
          <div className="pinned-dock">
            {pinned.map((v) => (
              <a key={v.id} href={v.url} target="_blank" rel="noreferrer" className="pinned-item card hover">
                <ServiceIcon url={v.url} size={40} />
                <div style={{ minWidth: 0 }}>
                  <div className="card-meta">{detectService(v.url).name}</div>
                  <div className="ellipsis" style={{ fontWeight: 600 }}>{v.title}</div>
                </div>
              </a>
            ))}
          </div>
        </>
      )}

      <div className="row wrap" style={{ gap: 6, margin: "16px 0 12px" }}>
        {["All", ...categories].map((c) => (
          <button key={c} className={cx("chip-btn", cat === c && "active")} onClick={() => setCat(c)}>
            {c}
            <span className="count num">{c === "All" ? items.length : counts[c] ?? 0}</span>
          </button>
        ))}
        {perm.can("vault.add") &&
          (newCat === null ? (
            <button className="chip-btn" style={{ borderStyle: "dashed" }} onClick={() => setNewCat("")}><Plus size={12} /> Category</button>
          ) : (
            <input
              className="input"
              autoFocus
              style={{ width: 140, height: 28, borderRadius: 999 }}
              placeholder="New category"
              value={newCat}
              onChange={(e) => setNewCat(e.target.value)}
              onBlur={() => setNewCat(null)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newCat.trim()) { addVaultCategory(wsId, newCat.trim()); setCat(newCat.trim()); setNewCat(null); }
                if (e.key === "Escape") setNewCat(null);
              }}
            />
          ))}
        <div className="row" style={{ marginLeft: "auto", gap: 12, flex: "none" }}>
          {projects.length > 0 && (
            <select className="select" style={{ width: 190, height: 30, borderRadius: 999 }} value={project} onChange={(e) => setProject(e.target.value)} aria-label="Filter by project">
              <option value="">All projects</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <label className="row card-meta" style={{ gap: 6, cursor: "pointer", whiteSpace: "nowrap" }}>
            <Toggle on={favOnly} onChange={setFavOnly} label="Favorites only" /> Favorites
          </label>
        </div>
      </div>

      {shown.length === 0 ? (
        <Empty icon={<Library size={22} />} title={items.length ? "No links match" : "Your Vault is empty"}>
          {items.length ? "Try another category or search." : "Save Docs, Figma files, repos and meeting links so nobody has to ask for them again."}
        </Empty>
      ) : view === "grid" ? (
        <div className="grid-auto" style={{ ["--min" as string]: "250px" }}>
          {shown.map((v) => (
            <a key={v.id} href={v.url} target="_blank" rel="noreferrer" className="card vault-card">
              <div className="row" style={{ alignItems: "flex-start" }}>
                <ServiceIcon url={v.url} size={36} />
                <div className="grow" />
                <Fav v={v} />
                <ItemMenu v={v} />
              </div>
              <div style={{ fontWeight: 600, marginTop: 12 }} className="ellipsis">{v.title}</div>
              <div className="card-meta ellipsis">{domainOf(v.url)}</div>
              {v.description && <div className="muted clamp-2" style={{ fontSize: 12, marginTop: 6 }}>{v.description}</div>}
              <div className="grow" />
              <div className="row" style={{ marginTop: 12, gap: 6 }}>
                <span className="tag">{v.category}</span>
                {v.projectId && projectsMap[v.projectId] && <span className="tag ellipsis" style={{ maxWidth: 120 }}>{projectsMap[v.projectId].name}</span>}
                <div className="grow" />
                <Avatar user={users[v.addedBy]} size={18} title={`Added by ${users[v.addedBy]?.name}`} />
              </div>
            </a>
          ))}
        </div>
      ) : (
        <table className="table">
          <thead>
            <tr><th>Title</th><th>Category</th><th>Project</th><th>Added by</th><th>Date</th><th style={{ width: 70 }} /></tr>
          </thead>
          <tbody>
            {shown.map((v) => (
              <tr key={v.id} onClick={() => window.open(v.url, "_blank", "noopener")}>
                <td>
                  <span className="row">
                    <ServiceIcon url={v.url} size={26} />
                    <span>
                      <div style={{ fontWeight: 500 }}>{v.title}</div>
                      <div className="card-meta">{domainOf(v.url)}</div>
                    </span>
                  </span>
                </td>
                <td><span className="tag">{v.category}</span></td>
                <td className="muted">{v.projectId ? projectsMap[v.projectId]?.name : "—"}</td>
                <td><span className="row" style={{ gap: 6 }}><Avatar user={users[v.addedBy]} size={18} />{firstName(users[v.addedBy]?.name ?? "")}</span></td>
                <td className="muted num">{shortDate(v.at)}</td>
                <td onClick={(e) => e.stopPropagation()}><span className="row" style={{ gap: 0 }}><Fav v={v} /><ItemMenu v={v} /></span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <VaultModal item={editing} onClose={() => setEditing(null)} categories={categories} />
    </Page>
  );
}

function VaultModal({ item, onClose, categories }: { item: VaultItem | "new" | null; onClose: () => void; categories: string[] }) {
  const wsId = useWsId();
  const projects = useWsProjects();
  const addVault = useDB((s) => s.addVault);
  const updateVault = useDB((s) => s.updateVault);
  const addVaultCategory = useDB((s) => s.addVaultCategory);
  const users = useDB((s) => s.users);
  const toast = useUI((s) => s.toast);
  const blank = { title: "", url: "", description: "", category: "Documents", projectId: "", tags: "", notes: "", pinned: false };
  const [f, setF] = useState(blank);
  const editing = item && item !== "new" ? item : null;

  useEffect(() => {
    if (!item) return;
    setF(
      editing
        ? { title: editing.title, url: editing.url, description: editing.description, category: editing.category, projectId: editing.projectId ?? "", tags: editing.tags.join(", "), notes: editing.notes, pinned: editing.pinned }
        : blank,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item]);

  const svc = f.url ? detectService(f.url) : null;
  const save = () => {
    if (!f.url.trim()) return;
    const data = {
      title: f.title.trim() || svc?.name || domainOf(f.url),
      url: f.url.trim(),
      description: f.description.trim(),
      category: f.category,
      projectId: f.projectId || null,
      tags: f.tags.split(/[,\s]+/).filter(Boolean),
      notes: f.notes.trim(),
      pinned: f.pinned,
    };
    if (!categories.includes(f.category)) addVaultCategory(wsId, f.category);
    if (editing) updateVault(editing.id, data);
    else addVault({ ...data, workspaceId: wsId });
    toast(editing ? "Link updated" : "Saved to Vault");
    onClose();
  };

  return (
    <Modal open={!!item} onClose={onClose} title={editing ? "Edit link" : "Add to Vault"} sub={editing ? `Added by ${users[editing.addedBy]?.name} · ${ago(editing.at)}` : "Save a shortcut to a shared resource."}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!f.url.trim()} onClick={save}>{editing ? "Save" : "Add link"}</button></>}>
      <div className="stack">
        <div className="row">
          {f.url ? <ServiceIcon url={f.url} size={40} /> : <span className="tile" style={{ width: 40, height: 40, borderRadius: 12 }} />}
          <input className="input" autoFocus placeholder="Paste a URL — figma.com/…, docs.google.com/…" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} style={{ height: 40 }} />
        </div>
        {svc && <div className="card-meta">Detected: {svc.name}</div>}
        <input className="input" placeholder="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <textarea className="textarea" style={{ minHeight: 60 }} placeholder="Short description" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <div className="field-row">
          <label className="field">
            <span>Category</span>
            <input className="input" list="vault-cats" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} />
            <datalist id="vault-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          </label>
          <label className="field">
            <span>Project</span>
            <select className="select" value={f.projectId} onChange={(e) => setF({ ...f, projectId: e.target.value })}>
              <option value="">Whole workspace</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        </div>
        <input className="input" placeholder="Tags (comma separated)" value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} />
        <textarea className="textarea" style={{ minHeight: 54 }} placeholder="Notes (optional)" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        <label className="row" style={{ cursor: "pointer" }}>
          <Toggle on={f.pinned} onChange={(v) => setF({ ...f, pinned: v })} label="Pin" /> Pin to the top of the Vault
        </label>
      </div>
    </Modal>
  );
}
