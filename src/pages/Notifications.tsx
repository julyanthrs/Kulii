import { useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { useDB } from "../store/db";
import { useMe } from "../store/hooks";
import { Empty, Page, Segmented } from "../components/ui";
import { NotificationItem } from "../components/overlays/Overlays";
import type { NotificationType } from "../data/types";

const GROUPS: Record<string, NotificationType[] | null> = {
  all: null,
  tasks: ["assigned", "approved", "changes", "review"],
  deadlines: ["due_soon", "overdue", "deadline", "reminder"],
  mentions: ["mention"],
  team: ["member", "project", "announcement"],
};

export default function Notifications() {
  const me = useMe();
  const all = useDB((s) => s.notifications);
  const markAllRead = useDB((s) => s.markAllRead);
  const [g, setG] = useState<keyof typeof GROUPS>("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const mine = all.filter((n) => n.userId === me.id);
  const list = mine.filter((n) => (!GROUPS[g] || GROUPS[g]!.includes(n.type)) && (!unreadOnly || !n.read));

  return (
    <Page
      title="Notifications"
      sub={`${mine.filter((n) => !n.read).length} unread`}
      actions={
        <>
          <Segmented value={g} onChange={setG} options={[
            { value: "all", label: "All" }, { value: "tasks", label: "Tasks" }, { value: "deadlines", label: "Deadlines" },
            { value: "mentions", label: "Mentions" }, { value: "team", label: "Team" },
          ]} />
          <button className={`chip-btn ${unreadOnly ? "active" : ""}`} onClick={() => setUnreadOnly(!unreadOnly)}>Unread</button>
          <button className="btn" onClick={markAllRead}><CheckCheck size={14} /> Mark all read</button>
        </>
      }
    >
      <div className="card" style={{ padding: 6, maxWidth: 760 }}>
        {list.length === 0 ? <Empty icon={<Bell size={22} />} title="Nothing here" /> : list.map((n) => <NotificationItem key={n.id} n={n} />)}
      </div>
    </Page>
  );
}
