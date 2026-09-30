import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { format } from "date-fns";
import {
  ArrowRight,
  Bell,
  CheckCircle2,
  ChevronRight,
  Copy,
  CornerDownRight,
  FileIcon,
  Link2,
  Lock,
  MoreHorizontal,
  Paperclip,
  Plus,
  Repeat,
  Send,
  SmilePlus,
  Tag,
  Trash2,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import type { Comment, ReminderOffset, Task } from "../../data/types";
import { useDB } from "../../store/db";
import { taskProgress, usePerm, useWsMembers, useWsProjects, useWsTasks } from "../../store/hooks";
import { useUI } from "../../store/ui";
import { ago, cx, fileSize, firstName, fullDate, isOverdue, STATUS_LABEL } from "../../lib/utils";
import { Avatar, Bar, Checkbox, Menu, MenuItem, StatusLabel } from "../ui";
import { AssigneePicker, PriorityMenu, StatusMenu } from "./TaskBits";

const REACTIONS = ["👍", "🎉", "👀", "❤️"];

function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return format(d, "yyyy-MM-dd'T'HH:mm");
}

export function TaskDrawer() {
  const openId = useUI((s) => s.openTaskId);
  const openTask = useUI((s) => s.openTask);
  const task = useDB((s) => (openId ? s.tasks[openId] : undefined));

  useEffect(() => {
    if (!openId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector(".popover")) openTask(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openId, openTask]);

  if (!openId || !task) return null;
  return createPortal(
    <>
      <div className="drawer-overlay" onClick={() => openTask(null)} />
      <aside className="drawer" role="dialog" aria-label={task.title}>
        <DrawerContent key={task.id} task={task} onClose={() => openTask(null)} />
      </aside>
    </>,
    document.body,
  );
}

function DrawerContent({ task, onClose }: { task: Task; onClose: () => void }) {
  const db = useDB();
  const { users, teams, projects, tasks: allTasks } = db;
  const perm = usePerm(task.workspaceId);
  const canEdit = perm.can("task.edit", task);
  const canAssign = perm.can("task.assign") || (task.workspaceId.startsWith("p:") && canEdit);
  const canReview = perm.can("task.review");
  const canComment = perm.can("task.comment");
  const toast = useUI((s) => s.toast);
  const openTask = useUI((s) => s.openTask);
  const wsProjects = useWsProjects(task.workspaceId);
  const wsTasks = useWsTasks(task.workspaceId);
  const me = db.currentUserId ?? "u1";

  const [title, setTitle] = useState(task.title);
  const [desc, setDesc] = useState(task.description);
  const [tab, setTab] = useState<"comments" | "activity" | "files">("comments");
  const [newSub, setNewSub] = useState("");
  const [newTag, setNewTag] = useState("");
  const [changesNote, setChangesNote] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => setTitle(task.title), [task.title]);

  const wsName = task.workspaceId.startsWith("p:") ? "Personal" : teams[task.workspaceId]?.name;
  const project = task.projectId ? projects[task.projectId] : null;
  const progress = taskProgress(task);
  const blockers = task.blockedBy.map((id) => allTasks[id]).filter((t): t is Task => !!t && !t.deletedAt);
  const blocks = wsTasks.filter((t) => t.blockedBy.includes(task.id));
  const openBlockers = blockers.filter((b) => b.status !== "done");
  const events = db.activity.filter((a) => a.taskId === task.id);
  const isAssignee = task.assigneeIds.includes(me);
  const up = (patch: Partial<Task>) => db.updateTask(task.id, patch);

  const commitTitle = () => {
    const t = title.trim();
    if (t && t !== task.title) up({ title: t });
    else setTitle(task.title);
  };

  return (
    <>
      {/* header */}
      <div className="row" style={{ padding: "14px 14px 0 20px" }}>
        <div className="crumbs grow" style={{ margin: 0 }}>
          <span>{wsName}</span>
          {project && (
            <>
              <ChevronRight size={12} />
              <span className="ellipsis">{project.name}</span>
            </>
          )}
        </div>
        <Menu
          width={200}
          trigger={(p) => (
            <button ref={p.ref} onClick={p.onClick} className="icon-btn sm" aria-label="More">
              <MoreHorizontal size={16} />
            </button>
          )}
        >
          {(close) => (
            <>
              <MenuItem
                icon={<Copy size={14} />}
                onClick={() => {
                  navigator.clipboard?.writeText(`${location.origin}/tasks?task=${task.id}`);
                  toast("Link copied");
                  close();
                }}
              >
                Copy link
              </MenuItem>
              <MenuItem
                icon={<Plus size={14} />}
                disabled={!perm.can("task.create")}
                onClick={() => {
                  const { id: _id, comments: _c, createdAt: _ca, updatedAt: _ua, completedAt: _co, ...rest } = task;
                  const id = db.createTask({ ...JSON.parse(JSON.stringify(rest)), title: `${task.title} (copy)`, status: "todo" });
                  openTask(id);
                  close();
                }}
              >
                Duplicate
              </MenuItem>
              <div className="menu-sep" />
              <MenuItem
                danger
                icon={<Trash2 size={14} />}
                disabled={!perm.can("task.delete") && !(canEdit && task.createdBy === me)}
                onClick={() => {
                  db.trashTask(task.id);
                  toast("Moved to Trash", { label: "Undo", run: () => db.restoreTask(task.id) });
                  onClose();
                }}
              >
                Move to Trash
              </MenuItem>
            </>
          )}
        </Menu>
        <button className="icon-btn sm" onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "8px 20px 20px" }}>
        {/* title */}
        <textarea
          className="inline-input"
          value={title}
          readOnly={!canEdit}
          rows={1}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLTextAreaElement).blur();
            }
          }}
          style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em", resize: "none", lineHeight: 1.25, fieldSizing: "content" } as React.CSSProperties}
          aria-label="Task title"
        />
        {!canEdit && (
          <div className="chip" style={{ marginTop: 6 }}>
            <Lock size={11} /> {perm.role === "VIEWER" ? "View only" : "You can comment, but only assignees and admins can edit"}
          </div>
        )}

        {/* review banner */}
        {task.status === "review" && (
          <div className="card" style={{ marginTop: 12, padding: 12, background: "var(--accent-soft)", borderColor: "var(--accent-line)" }}>
            <div className="row">
              <CheckCircle2 size={16} style={{ color: "var(--accent)" }} />
              <div className="grow" style={{ fontWeight: 500 }}>Waiting for review</div>
              {canReview && changesNote === null && (
                <>
                  <button className="btn sm" onClick={() => setChangesNote("")}>
                    <Undo2 size={13} /> Request changes
                  </button>
                  <button className="btn sm accent" onClick={() => { db.approveTask(task.id); toast("Task approved"); }}>
                    Approve
                  </button>
                </>
              )}
            </div>
            {changesNote !== null && (
              <div className="row" style={{ marginTop: 10 }}>
                <input className="input" autoFocus placeholder="What needs to change?" value={changesNote} onChange={(e) => setChangesNote(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && changesNote.trim() && (db.requestChanges(task.id, changesNote.trim()), setChangesNote(null), toast("Changes requested"))} />
                <button className="btn sm" onClick={() => setChangesNote(null)}>Cancel</button>
                <button className="btn sm primary" disabled={!changesNote.trim()} onClick={() => { db.requestChanges(task.id, changesNote.trim()); setChangesNote(null); toast("Changes requested"); }}>
                  Send
                </button>
              </div>
            )}
            {!canReview && <div className="card-meta" style={{ marginTop: 4 }}>An owner or admin will approve or request changes.</div>}
          </div>
        )}

        {/* properties */}
        <div className="props">
          <span>Status</span>
          <div className="row wrap">
            <StatusMenu value={task.status} disabled={!canEdit} onChange={(s) => up({ status: s })} />
            {canEdit && (task.status === "in_progress" || task.status === "todo") && isAssignee && !task.workspaceId.startsWith("p:") && (
              <button className="btn sm ghost" onClick={() => { up({ status: "review" }); toast("Submitted for review"); }}>
                Submit for review <ArrowRight size={12} />
              </button>
            )}
          </div>
          <span>Priority</span>
          <div><PriorityMenu value={task.priority} disabled={!canEdit} onChange={(p) => up({ priority: p })} /></div>
          <span>Assigned</span>
          <div>
            <AssigneePicker wsId={task.workspaceId} value={task.assigneeIds} disabled={!canAssign} onChange={(ids) => up({ assigneeIds: ids })} />
          </div>
          <span>Due</span>
          <div className="row">
            <input
              type="datetime-local"
              className="input"
              style={{ width: 210, height: 30, color: isOverdue(task.dueDate, task.status) ? "var(--danger)" : undefined }}
              value={toLocalInput(task.dueDate)}
              disabled={!canEdit}
              onChange={(e) => up({ dueDate: e.target.value ? new Date(e.target.value).toISOString() : null })}
            />
          </div>
          <span>Start</span>
          <div>
            <input
              type="date"
              className="input"
              style={{ width: 160, height: 30 }}
              value={task.startDate ? format(new Date(task.startDate), "yyyy-MM-dd") : ""}
              disabled={!canEdit}
              onChange={(e) => up({ startDate: e.target.value ? new Date(`${e.target.value}T09:00`).toISOString() : null })}
            />
          </div>
          <span>Project</span>
          <div>
            <select className="select" style={{ width: 220, height: 30 }} disabled={!canEdit} value={task.projectId ?? ""} onChange={(e) => up({ projectId: e.target.value || null })}>
              <option value="">No project</option>
              {wsProjects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <span>Tags</span>
          <div className="row wrap" style={{ gap: 5 }}>
            {task.tags.map((t) => (
              <span key={t} className="tag">
                #{t}
                {canEdit && (
                  <button aria-label={`Remove ${t}`} onClick={() => up({ tags: task.tags.filter((x) => x !== t) })} style={{ marginLeft: 4, display: "grid" }}>
                    <X size={10} />
                  </button>
                )}
              </span>
            ))}
            {canEdit && (
              <span className="row tag" style={{ gap: 4, background: "transparent", border: "1px dashed var(--line-strong)" }}>
                <Tag size={10} />
                <input
                  className="inline-input"
                  style={{ width: 60, fontSize: 11 }}
                  placeholder="add tag"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value.replace(/\s/g, "-"))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newTag.trim()) {
                      if (!task.tags.includes(newTag.trim())) up({ tags: [...task.tags, newTag.trim()] });
                      setNewTag("");
                    }
                  }}
                />
              </span>
            )}
          </div>
          <span>Reminder</span>
          <div className="row">
            <Bell size={13} className="faint" />
            <select className="select" style={{ width: 160, height: 30 }} disabled={!canEdit} value={task.reminder} onChange={(e) => up({ reminder: e.target.value as ReminderOffset, remindedAt: null })}>
              <option value="none">None</option>
              <option value="10m">10 minutes before</option>
              <option value="1h">1 hour before</option>
              <option value="1d">1 day before</option>
              <option value="custom">Custom…</option>
            </select>
            {task.reminder === "custom" && (
              <>
                <input type="number" min={1} className="input num" style={{ width: 70, height: 30 }} disabled={!canEdit} value={task.reminderCustomMin}
                  onChange={(e) => up({ reminderCustomMin: Math.max(1, Number(e.target.value) || 1), remindedAt: null })} />
                <span className="card-meta">min before</span>
              </>
            )}
          </div>
          <span>Repeat</span>
          <div className="row">
            <Repeat size={13} className="faint" />
            <select
              className="select"
              style={{ width: 160, height: 30 }}
              disabled={!canEdit}
              value={task.recurrence?.freq ?? "none"}
              onChange={(e) => up({ recurrence: e.target.value === "none" ? null : { freq: e.target.value as "daily", interval: task.recurrence?.interval ?? 3 } })}
            >
              <option value="none">Does not repeat</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="custom">Custom…</option>
            </select>
            {task.recurrence?.freq === "custom" && (
              <>
                <span className="card-meta">every</span>
                <input type="number" min={1} className="input num" style={{ width: 60, height: 30 }} disabled={!canEdit} value={task.recurrence.interval}
                  onChange={(e) => up({ recurrence: { freq: "custom", interval: Math.max(1, Number(e.target.value) || 1) } })} />
                <span className="card-meta">days</span>
              </>
            )}
          </div>
          <span>Created</span>
          <div className="row card-meta" style={{ color: "var(--text-2)" }}>
            <Avatar user={users[task.createdBy]} size={18} />
            {users[task.createdBy]?.name} · {fullDate(task.createdAt)}
          </div>
        </div>

        {/* description */}
        <div className="label" style={{ margin: "18px 0 6px" }}>Description</div>
        <textarea
          className="textarea"
          placeholder={canEdit ? "Add more detail…" : "No description"}
          value={desc}
          readOnly={!canEdit}
          onChange={(e) => setDesc(e.target.value)}
          onBlur={() => desc !== task.description && up({ description: desc })}
        />

        {/* dependencies */}
        <div className="section-title" style={{ marginTop: 18 }}>
          <span className="label">Dependencies</span>
          {canEdit && (
            <Menu
              width={280}
              trigger={(p) => (
                <button ref={p.ref} onClick={p.onClick} className="btn sm ghost">
                  <Link2 size={12} /> Add blocker
                </button>
              )}
            >
              {(close) => (
                <>
                  <div className="menu-label">Blocked by…</div>
                  {wsTasks
                    .filter((t) => t.id !== task.id && !task.blockedBy.includes(t.id) && !t.blockedBy.includes(task.id))
                    .slice(0, 40)
                    .map((t) => (
                      <MenuItem key={t.id} end={STATUS_LABEL[t.status]} onClick={() => { up({ blockedBy: [...task.blockedBy, t.id] }); close(); }}>
                        {t.title}
                      </MenuItem>
                    ))}
                </>
              )}
            </Menu>
          )}
        </div>
        {blockers.length === 0 && blocks.length === 0 ? (
          <div className="card-meta" style={{ padding: "0 2px" }}>No dependencies.</div>
        ) : (
          <div className="stack" style={{ gap: 4 }}>
            {openBlockers.length > 0 && (
              <div className="chip" style={{ alignSelf: "flex-start", color: "var(--danger)" }}>
                <Lock size={11} /> Blocked until {openBlockers.length} task{openBlockers.length > 1 ? "s are" : " is"} completed
              </div>
            )}
            {blockers.map((b) => (
              <div key={b.id} className="list-row clickable" style={{ padding: "5px 8px" }} onClick={() => openTask(b.id)}>
                <span className="card-meta" style={{ width: 64 }}>Blocked by</span>
                <span className="grow ellipsis" style={{ fontWeight: 500 }}>{b.title}</span>
                <StatusLabel s={b.status} />
                {canEdit && (
                  <button className="icon-btn sm" aria-label="Remove dependency" onClick={(e) => { e.stopPropagation(); up({ blockedBy: task.blockedBy.filter((x) => x !== b.id) }); }}>
                    <X size={12} />
                  </button>
                )}
              </div>
            ))}
            {blocks.map((b) => (
              <div key={b.id} className="list-row clickable" style={{ padding: "5px 8px" }} onClick={() => openTask(b.id)}>
                <span className="card-meta" style={{ width: 64 }}>Blocks</span>
                <span className="grow ellipsis" style={{ fontWeight: 500 }}>{b.title}</span>
                <StatusLabel s={b.status} />
              </div>
            ))}
          </div>
        )}

        {/* subtasks */}
        <div className="section-title" style={{ marginTop: 18 }}>
          <span className="label">Subtasks</span>
          {task.subtasks.length > 0 && (
            <span className="card-meta num">
              {task.subtasks.filter((s) => s.done).length}/{task.subtasks.length} · {Math.round(progress * 100)}%
            </span>
          )}
        </div>
        {task.subtasks.length > 0 && <div style={{ margin: "0 2px 6px" }}><Bar value={progress} accent /></div>}
        <div>
          {task.subtasks.map((s) => (
            <div key={s.id} className="list-row" style={{ padding: "5px 6px" }}>
              <Checkbox on={s.done} size={16} onChange={() => canEdit && db.toggleSubtask(task.id, s.id)} label={s.title} />
              <span className="grow" style={{ textDecoration: s.done ? "line-through" : undefined, color: s.done ? "var(--text-3)" : undefined }}>{s.title}</span>
              {canEdit && (
                <button className="icon-btn sm" aria-label="Remove subtask" onClick={() => db.removeSubtask(task.id, s.id)}>
                  <X size={12} />
                </button>
              )}
            </div>
          ))}
          {canEdit && (
            <div className="row" style={{ padding: "5px 6px" }}>
              <Plus size={15} className="faint" />
              <input
                className="inline-input"
                placeholder="Add subtask"
                value={newSub}
                onChange={(e) => setNewSub(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newSub.trim()) {
                    db.addSubtask(task.id, newSub.trim());
                    setNewSub("");
                  }
                }}
              />
            </div>
          )}
        </div>

        {/* tabs */}
        <div className="tabs" style={{ marginTop: 18 }}>
          <button className={cx(tab === "comments" && "on")} onClick={() => setTab("comments")}>
            Comments <span className="count">{task.comments.length}</span>
          </button>
          <button className={cx(tab === "activity" && "on")} onClick={() => setTab("activity")}>Activity</button>
          <button className={cx(tab === "files" && "on")} onClick={() => setTab("files")}>
            Attachments <span className="count">{task.attachments.length}</span>
          </button>
        </div>

        {tab === "comments" && <Comments task={task} canComment={canComment} />}

        {tab === "activity" && (
          <div style={{ paddingTop: 10 }}>
            {events.length === 0 && <div className="card-meta">No activity yet.</div>}
            <ul className="timeline">
              {events.map((e) => (
                <li key={e.id}>
                  <Avatar user={users[e.actorId]} size={20} />
                  <div className="grow">
                    <b>{firstName(users[e.actorId]?.name ?? "Someone")}</b> {e.text}
                    <div className="card-meta">{ago(e.at)}</div>
                  </div>
                </li>
              ))}
              <li>
                <Avatar user={users[task.createdBy]} size={20} />
                <div className="grow">
                  <b>{firstName(users[task.createdBy]?.name ?? "")}</b> created the task
                  <div className="card-meta">{ago(task.createdAt)}</div>
                </div>
              </li>
            </ul>
          </div>
        )}

        {tab === "files" && (
          <div style={{ paddingTop: 10 }}>
            {task.attachments.map((a) => (
              <div key={a.id} className="list-row">
                <span className="tile" style={{ width: 32, height: 32, display: "grid", placeItems: "center" }}>
                  <FileIcon size={15} className="muted" />
                </span>
                <div className="grow">
                  <div className="ellipsis" style={{ fontWeight: 500 }}>{a.name}</div>
                  <div className="card-meta">{fileSize(a.size)} · {firstName(users[a.uploadedBy]?.name ?? "")} · {ago(a.at)}</div>
                </div>
                {(canEdit || a.uploadedBy === me) && (
                  <button className="icon-btn sm" aria-label="Remove attachment" onClick={() => db.removeAttachment(task.id, a.id)}>
                    <X size={13} />
                  </button>
                )}
              </div>
            ))}
            {task.attachments.length === 0 && <div className="card-meta" style={{ marginBottom: 10 }}>No files yet.</div>}
            {canComment && (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  hidden
                  onChange={(e) => {
                    for (const f of Array.from(e.target.files ?? [])) db.addAttachment(task.id, { name: f.name, size: f.size });
                    e.target.value = "";
                  }}
                />
                <button className="btn sm" style={{ marginTop: 6 }} onClick={() => fileRef.current?.click()}>
                  <Upload size={13} /> Upload file
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}

/* ---------------- Comments ---------------- */

function renderBody(body: string) {
  return body.split(/(@[\w.-]+)/g).map((part, i) =>
    part.startsWith("@") ? (
      <span key={i} className="mention">{part}</span>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

function Comments({ task, canComment }: { task: Task; canComment: boolean }) {
  const users = useDB((s) => s.users);
  const toggleReaction = useDB((s) => s.toggleReaction);
  const me = useDB((s) => s.currentUserId) ?? "u1";
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const roots = task.comments.filter((c) => !c.parentId);
  const replies = (id: string) => task.comments.filter((c) => c.parentId === id);

  const CommentView = ({ c, nested }: { c: Comment; nested?: boolean }) => (
    <div className="comment" style={nested ? { marginLeft: 30 } : undefined}>
      <Avatar user={users[c.authorId]} size={nested ? 20 : 24} />
      <div className="grow">
        <div className="row" style={{ gap: 6 }}>
          <b style={{ fontWeight: 600 }}>{users[c.authorId]?.name}</b>
          <span className="card-meta">{ago(c.at)}</span>
        </div>
        <div className="comment-body">{renderBody(c.body)}</div>
        {c.attachments.length > 0 && (
          <div className="row wrap" style={{ gap: 4, marginTop: 5 }}>
            {c.attachments.map((a) => (
              <span key={a.id} className="chip"><Paperclip size={10} />{a.name}</span>
            ))}
          </div>
        )}
        <div className="row wrap" style={{ gap: 4, marginTop: 5 }}>
          {Object.entries(c.reactions).map(([emo, who]) => (
            <button key={emo} className={cx("reaction", who.includes(me) && "on")} onClick={() => canComment && toggleReaction(task.id, c.id, emo)}
              title={who.map((w) => users[w]?.name).join(", ")}>
              {emo} <span className="num">{who.length}</span>
            </button>
          ))}
          {canComment && (
            <Menu
              align="start"
              width={150}
              trigger={(p) => (
                <button ref={p.ref} onClick={p.onClick} className="icon-btn sm" aria-label="React" style={{ width: 22, height: 22 }}>
                  <SmilePlus size={13} />
                </button>
              )}
            >
              {(close) => (
                <div className="row" style={{ gap: 2, padding: 2 }}>
                  {REACTIONS.map((e) => (
                    <button key={e} className="icon-btn sm" style={{ fontSize: 15 }} onClick={() => { toggleReaction(task.id, c.id, e); close(); }}>{e}</button>
                  ))}
                </div>
              )}
            </Menu>
          )}
          {canComment && !nested && (
            <button className="card-meta reply-btn" onClick={() => setReplyTo(replyTo === c.id ? null : c.id)}>Reply</button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ paddingTop: 10 }}>
      {roots.length === 0 && <div className="card-meta" style={{ marginBottom: 10 }}>No comments yet. Start the conversation.</div>}
      <div className="stack" style={{ gap: 12 }}>
        {roots.map((c) => (
          <div key={c.id} className="stack" style={{ gap: 8 }}>
            <CommentView c={c} />
            {replies(c.id).map((r) => (
              <CommentView key={r.id} c={r} nested />
            ))}
            {replyTo === c.id && (
              <div style={{ marginLeft: 30 }}>
                <Composer task={task} parentId={c.id} autoFocus onDone={() => setReplyTo(null)} placeholder={`Reply to ${firstName(users[c.authorId]?.name ?? "")}…`} />
              </div>
            )}
          </div>
        ))}
      </div>
      {canComment ? (
        <div style={{ marginTop: 14 }}>
          <Composer task={task} />
        </div>
      ) : (
        <div className="chip" style={{ marginTop: 12 }}><Lock size={11} /> Viewers can't comment</div>
      )}
    </div>
  );
}

function Composer({ task, parentId = null, autoFocus, onDone, placeholder = "Comment… use @ to mention" }: { task: Task; parentId?: string | null; autoFocus?: boolean; onDone?: () => void; placeholder?: string }) {
  const [v, setV] = useState("");
  const [files, setFiles] = useState<{ name: string; size: number }[]>([]);
  const addComment = useDB((s) => s.addComment);
  const members = useWsMembers(task.workspaceId);
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const m = /@([\w.-]*)$/.exec(v);
  const q = m?.[1].toLowerCase() ?? null;
  const suggestions = useMemo(
    () => (q === null ? [] : members.filter(({ user }) => firstName(user.name).toLowerCase().startsWith(q) || user.username.startsWith(q)).slice(0, 5)),
    [q, members],
  );

  const send = () => {
    if (!v.trim() && !files.length) return;
    addComment(task.id, v.trim() || "Attached files", parentId, files);
    setV("");
    setFiles([]);
    onDone?.();
  };

  return (
    <div className="composer">
      {suggestions.length > 0 && (
        <div className="mention-list">
          {suggestions.map(({ user }) => (
            <button
              key={user.id}
              className="menu-item"
              onMouseDown={(e) => {
                e.preventDefault();
                setV(v.replace(/@([\w.-]*)$/, `@${firstName(user.name)} `));
                taRef.current?.focus();
              }}
            >
              <Avatar user={user} size={18} /> {user.name} <span className="end">@{user.username}</span>
            </button>
          ))}
        </div>
      )}
      <textarea
        ref={taRef}
        className="inline-input"
        autoFocus={autoFocus}
        rows={2}
        placeholder={placeholder}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !suggestions.length) {
            e.preventDefault();
            send();
          }
        }}
        style={{ resize: "none" }}
      />
      {files.length > 0 && (
        <div className="row wrap" style={{ gap: 4 }}>
          {files.map((f, i) => (
            <span key={i} className="chip">
              <Paperclip size={10} /> {f.name}
              <button onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label="Remove"><X size={10} /></button>
            </span>
          ))}
        </div>
      )}
      <div className="row">
        <input ref={fileRef} type="file" multiple hidden onChange={(e) => { setFiles([...files, ...Array.from(e.target.files ?? []).map((f) => ({ name: f.name, size: f.size }))]); e.target.value = ""; }} />
        <button className="icon-btn sm" aria-label="Attach file" onClick={() => fileRef.current?.click()}>
          <Paperclip size={14} />
        </button>
        {parentId && <span className="card-meta row" style={{ gap: 4 }}><CornerDownRight size={11} /> Replying</span>}
        <div className="grow" />
        {onDone && <button className="btn sm ghost" onClick={onDone}>Cancel</button>}
        <button className="btn sm primary" onClick={send} disabled={!v.trim() && !files.length}>
          <Send size={12} /> Send
        </button>
      </div>
    </div>
  );
}
