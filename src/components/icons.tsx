import {
  BookOpen,
  Box,
  Briefcase,
  Camera,
  Cloud,
  Code2,
  Compass,
  Cpu,
  FileText,
  Figma,
  FlaskConical,
  FolderOpen,
  Github,
  Globe,
  GraduationCap,
  Heart,
  Layers,
  Megaphone,
  Music,
  NotebookText,
  Palette,
  PenTool,
  Presentation,
  Rocket,
  Sheet,
  Sparkles,
  User,
  Users,
  Video,
  type LucideIcon,
} from "lucide-react";
import type { CSSProperties } from "react";
import { domainOf } from "../lib/utils";

export const TEAM_ICONS: Record<string, LucideIcon> = {
  graduation: GraduationCap,
  code: Code2,
  pen: PenTool,
  megaphone: Megaphone,
  rocket: Rocket,
  briefcase: Briefcase,
  flask: FlaskConical,
  layers: Layers,
  book: BookOpen,
  camera: Camera,
  cpu: Cpu,
  compass: Compass,
  heart: Heart,
  music: Music,
  sparkles: Sparkles,
  users: Users,
  user: User,
};

export const TEAM_COLORS = ["#6F8F72", "#6D7F99", "#A3806A", "#9A7A93", "#8C877F", "#B08D57", "#5F8C8A", "#8B6F9E", "#A26A6A", "#5E6B5A"];

export function WsBadge({ icon, color, size = 26 }: { icon: string; color: string; size?: number }) {
  const I = TEAM_ICONS[icon] ?? Layers;
  return (
    <span
      className="ws-badge"
      style={{ width: size, height: size, borderRadius: size * 0.32, background: `linear-gradient(150deg, ${color}, color-mix(in srgb, ${color} 70%, #1f1d1a))` }}
    >
      <I size={size * 0.52} strokeWidth={1.9} />
    </span>
  );
}

/* ---------------- Vault services ---------------- */

interface Service {
  name: string;
  icon: LucideIcon;
  tint: string;
}

const SERVICES: [RegExp, Service][] = [
  [/docs\.google\.com\/document/, { name: "Google Docs", icon: FileText, tint: "#4C7BD9" }],
  [/docs\.google\.com\/spreadsheets/, { name: "Google Sheets", icon: Sheet, tint: "#3E9A5E" }],
  [/docs\.google\.com\/presentation/, { name: "Google Slides", icon: Presentation, tint: "#D9A23A" }],
  [/drive\.google\.com/, { name: "Google Drive", icon: FolderOpen, tint: "#5E8FD6" }],
  [/meet\.google\.com/, { name: "Google Meet", icon: Video, tint: "#3E9A7A" }],
  [/zoom\.us/, { name: "Zoom", icon: Video, tint: "#4D82E0" }],
  [/figma\.com/, { name: "Figma", icon: Figma, tint: "#C4674F" }],
  [/github\.com/, { name: "GitHub", icon: Github, tint: "#3A3A38" }],
  [/notion\.so|notion\.site/, { name: "Notion", icon: NotebookText, tint: "#4A4844" }],
  [/canva\.com/, { name: "Canva", icon: Palette, tint: "#4AA3B5" }],
  [/dropbox\.com/, { name: "Dropbox", icon: Box, tint: "#4C73D1" }],
  [/onedrive\.|sharepoint\.com/, { name: "OneDrive", icon: Cloud, tint: "#4C86C9" }],
];

export function detectService(url: string): Service {
  for (const [re, s] of SERVICES) if (re.test(url)) return s;
  return { name: domainOf(url), icon: Globe, tint: "#8C877F" };
}

export function ServiceIcon({ url, size = 34 }: { url: string; size?: number }) {
  const s = detectService(url);
  const I = s.icon;
  const style: CSSProperties = {
    width: size,
    height: size,
    borderRadius: size * 0.3,
    display: "grid",
    placeItems: "center",
    flex: "none",
    color: s.tint,
    background: `color-mix(in srgb, ${s.tint} 13%, var(--tile))`,
    border: "1px solid var(--line-soft)",
  };
  return (
    <span style={style} title={s.name}>
      <I size={size * 0.48} strokeWidth={1.8} />
    </span>
  );
}
