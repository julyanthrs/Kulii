import {
  differenceInCalendarDays,
  format,
  formatDistanceToNowStrict,
  isToday,
  isTomorrow,
  isYesterday,
} from "date-fns";
import type { Priority, Status } from "../data/types";

let counter = 0;
export const uid = (p = "id") =>
  `${p}_${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const nowIso = () => new Date().toISOString();

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export const personalWs = (userId: string) => `p:${userId}`;
export const isPersonalWs = (wsId: string) => wsId.startsWith("p:");

export const STATUS_LABEL: Record<Status, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  review: "For Review",
  done: "Completed",
  blocked: "Blocked",
};
export const STATUS_ORDER: Status[] = ["todo", "in_progress", "review", "done", "blocked"];

export const PRIORITY_LABEL: Record<Priority, string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
};
export const PRIORITY_ORDER: Priority[] = ["urgent", "high", "medium", "low"];
export const PRIORITY_RANK: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

export function dueLabel(iso: string | null): string {
  if (!iso) return "No date";
  const d = new Date(iso);
  if (isToday(d)) return `Today, ${format(d, "h:mm a")}`;
  if (isTomorrow(d)) return "Tomorrow";
  if (isYesterday(d)) return "Yesterday";
  const diff = differenceInCalendarDays(d, new Date());
  if (diff > 0 && diff < 7) return format(d, "EEEE");
  return format(d, "MMM d");
}

export function shortDate(iso: string | null) {
  return iso ? format(new Date(iso), "MMM d") : "—";
}

export function fullDate(iso: string | null) {
  return iso ? format(new Date(iso), "MMM d, h:mm a") : "—";
}

export function ago(iso: string) {
  const d = new Date(iso);
  const secs = (Date.now() - d.getTime()) / 1000;
  if (secs < 45) return "just now";
  return formatDistanceToNowStrict(d, { addSuffix: true });
}

export function isOverdue(iso: string | null, status: Status) {
  return !!iso && status !== "done" && new Date(iso).getTime() < Date.now();
}

export function daysFromNow(days: number, hour = 17, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

export function hoursAgo(h: number) {
  return new Date(Date.now() - h * 3600_000).toISOString();
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function firstName(name: string) {
  return name.trim().split(/\s+/)[0];
}

export function domainOf(url: string) {
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function normalizeUrl(url: string) {
  const u = url.trim();
  if (!u) return u;
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
}

export function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function teamCode() {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}
