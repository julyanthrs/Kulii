import { useMemo, useState } from "react";
import { format, isToday, isYesterday } from "date-fns";
import { History } from "lucide-react";
import { useDB } from "../store/db";
import { useVisibleWsIds, useWorkspaces } from "../store/hooks";
import { useUI } from "../store/ui";
import { cx, firstName } from "../lib/utils";
import { Avatar, Empty, Page } from "../components/ui";
import { WsBadge } from "../components/icons";

export default function Activity() {
  const activity = useDB((s) => s.activity);
  const users = useDB((s) => s.users);
  const visible = useVisibleWsIds();
  const workspaces = useWorkspaces();
  const openTask = useUI((s) => s.openTask);
  const [ws, setWs] = useState<string>("all");
  const [who, setWho] = useState<string>("");
  const wsById = Object.fromEntries(workspaces.map((w) => [w.wsId, w]));

  const groups = useMemo(() => {
    const list = activity.filter((a) => visible.has(a.workspaceId) && (ws === "all" || a.workspaceId === ws) && (!who || a.actorId === who));
    const m = new Map<string, typeof list>();
    for (const a of list) {
      const d = new Date(a.at);
      const k = isToday(d) ? "Today" : isYesterday(d) ? "Yesterday" : format(d, "EEEE, MMM d");
      m.set(k, [...(m.get(k) ?? []), a]);
    }
    return [...m.entries()];
  }, [activity, visible, ws, who]);
  const actors = useMemo(() => [...new Set(activity.filter((a) => visible.has(a.workspaceId)).map((a) => a.actorId))], [activity, visible]);

  return (
    <Page
      title="Activity"
      sub="Every important change, across your workspaces"
      actions={
        <>
          <select className="select" style={{ width: 170, height: 32, borderRadius: 999 }} value={who} onChange={(e) => setWho(e.target.value)} aria-label="Filter by person">
            <option value="">Everyone</option>
            {actors.map((id) => users[id] && <option key={id} value={id}>{users[id].name}</option>)}
          </select>
        </>
      }
    >
      <div className="row wrap" style={{ gap: 6, marginBottom: 14 }}>
        <button className={cx("chip-btn", ws === "all" && "active")} onClick={() => setWs("all")}>All workspaces</button>
        {workspaces.map((w) => (
          <button key={w.id} className={cx("chip-btn", ws === w.wsId && "active")} onClick={() => setWs(w.wsId)}>
            <i className="pdot" style={{ background: w.color }} /> {w.name}
          </button>
        ))}
      </div>
      {groups.length === 0 && <Empty icon={<History size={22} />} title="No activity" />}
      <div style={{ maxWidth: 820 }}>
        {groups.map(([day, list]) => (
          <div key={day} style={{ marginBottom: 18 }}>
            <div className="label" style={{ margin: "0 4px 6px" }}>{day}</div>
            <div className="card" style={{ padding: 6 }}>
              {list.map((a) => {
                const w = wsById[a.workspaceId];
                return (
                  <div key={a.id} className={cx("list-row", a.taskId && "clickable")} onClick={() => a.taskId && openTask(a.taskId)}>
                    <Avatar user={users[a.actorId]} size={26} />
                    <div className="grow">
                      <b style={{ fontWeight: 600 }}>{firstName(users[a.actorId]?.name ?? "Someone")}</b> <span className="muted">{a.text}</span>
                    </div>
                    {w && <span className="row card-meta hide-sm" style={{ gap: 5 }}><WsBadge icon={w.icon} color={w.color} size={16} />{w.name}</span>}
                    <span className="card-meta num" style={{ width: 62, textAlign: "right" }}>{format(new Date(a.at), "h:mm a")}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Page>
  );
}
