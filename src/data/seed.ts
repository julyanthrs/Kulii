import type {
  ActivityEvent,
  Announcement,
  AppNotification,
  Comment,
  InboxItem,
  Membership,
  Priority,
  Project,
  Status,
  Task,
  Team,
  User,
  VaultItem,
} from "./types";
import { daysFromNow, hoursAgo, personalWs } from "../lib/utils";

export const DEFAULT_VAULT_CATEGORIES = [
  "Documents",
  "Design",
  "Development",
  "Research",
  "Meetings",
  "Assets",
  "References",
  "Other",
];

const created = hoursAgo(24 * 40);

const U = (id: string, name: string, username: string, title: string, hue: number, availability: User["availability"]): User => ({
  id,
  name,
  username,
  email: `${username}@example.com`, // reserved domain — sample accounts never receive real mail
  title,
  hue,
  availability,
  createdAt: created,
});

const seedUsers = () => [
  U("u1", "Julianne Reyes", "julianne", "Product Designer", 28, "available"),
  U("u2", "CJ Santos", "cj", "Backend Developer", 200, "busy"),
  U("u3", "Kurt Villanueva", "kurt", "Frontend Developer", 150, "available"),
  U("u4", "Alex Morgan", "alex", "Developer", 260, "away"),
  U("u5", "Maya Chen", "maya", "QA & Research", 330, "available"),
  U("u6", "Daniel Park", "daniel", "Project Manager", 90, "busy"),
  U("u7", "Priya Nair", "priya", "Marketing Lead", 10, "offline"),
  U("u8", "Leo Grant", "leo", "Visual Designer", 45, "available"),
];

/** Sample accounts — shown as quick sign-in buttons on the login page. */
export const DEMO_ACCOUNTS = seedUsers();
export const DEMO_PASSWORD = "demo1234";

export function buildSeed() {
  const users: User[] = seedUsers();

  const teams: Team[] = [
    { id: "t1", name: "Trackademic", description: "Academic progress tracker for students and advisers.", icon: "graduation", color: "#6F8F72", category: "Product", code: "TRK7Q2", createdAt: created, membersCanCreateTasks: true },
    { id: "t2", name: "OOP Team", description: "Object-oriented programming course project group.", icon: "code", color: "#6D7F99", category: "School", code: "OOP4K9", createdAt: created, membersCanCreateTasks: true },
    { id: "t3", name: "Design Team", description: "Shared design system, research and brand work.", icon: "pen", color: "#A3806A", category: "Design", code: "DSN8M3", createdAt: created, membersCanCreateTasks: true },
    { id: "t4", name: "Marketing", description: "Campaigns, content calendar and launch comms.", icon: "megaphone", color: "#9A7A93", category: "Marketing", code: "MKT2P6", createdAt: created, membersCanCreateTasks: false },
  ];

  const m = (teamId: string, userId: string, role: Membership["role"]): Membership => ({ teamId, userId, role, joinedAt: created });
  const memberships: Membership[] = [
    m("t1", "u1", "OWNER"), m("t1", "u2", "ADMIN"), m("t1", "u3", "MEMBER"), m("t1", "u4", "MEMBER"), m("t1", "u5", "MEMBER"), m("t1", "u8", "VIEWER"),
    m("t2", "u6", "OWNER"), m("t2", "u3", "ADMIN"), m("t2", "u1", "MEMBER"), m("t2", "u2", "MEMBER"),
    m("t3", "u1", "OWNER"), m("t3", "u8", "ADMIN"), m("t3", "u5", "MEMBER"), m("t3", "u3", "MEMBER"),
    m("t4", "u7", "OWNER"), m("t4", "u1", "VIEWER"), m("t4", "u4", "MEMBER"), m("t4", "u8", "MEMBER"),
  ];

  const P = (id: string, ws: string, name: string, description: string, memberIds: string[], start: number, end: number, by = "u1"): Project => ({
    id, workspaceId: ws, name, description, memberIds,
    startDate: daysFromNow(start, 9), deadline: daysFromNow(end, 23, 59),
    createdAt: daysFromNow(start - 2, 10), createdBy: by, archivedAt: null, deletedAt: null, links: [],
  });
  const pw = personalWs("u1");
  const projects: Project[] = [
    P("p1", "t1", "Trackademic Redesign", "Full refresh of the student dashboard and navigation.", ["u1", "u2", "u3", "u5"], -21, 12),
    P("p2", "t1", "Authentication", "Accounts, sessions, password recovery and SSO.", ["u2", "u3", "u4"], -14, 6),
    P("p3", "t1", "Mobile App", "React Native companion app for quick check-ins.", ["u3", "u4", "u1"], -3, 40),
    P("p4", "t1", "Documentation", "Developer and user-facing documentation.", ["u5", "u2"], -10, 20),
    P("p5", "t2", "Library System", "Java library management system — final OOP project.", ["u6", "u3", "u1", "u2"], -20, 9, "u6"),
    P("p6", "t2", "Final Presentation", "Slides, demo script and rehearsal.", ["u6", "u1"], -5, 4, "u6"),
    P("p7", "t3", "Design System v2", "Tokens, components and documentation for v2.", ["u1", "u8", "u5"], -30, 18),
    P("p8", "t3", "Website Redesign", "Marketing site redesign with new visual language.", ["u8", "u3", "u1"], -12, 25),
    P("p9", "t4", "Q4 Campaign", "Holiday launch campaign across channels.", ["u7", "u4", "u8"], -8, 30, "u7"),
    P("p10", "t4", "Brand Refresh", "Updated brand guidelines and assets.", ["u7", "u8"], -40, -2, "u7"),
    P("p11", pw, "Thesis", "Capstone research and writing.", ["u1"], -30, 60),
    P("p12", pw, "Home & Life", "Errands and personal admin.", ["u1"], -60, 90),
  ];
  // Completed project, ready to archive / already archived
  projects[9].archivedAt = hoursAgo(30);

  const tasks: Task[] = [];
  let n = 0;
  type Opts = {
    d?: string; a?: string[]; by?: string; due?: number | null; h?: number; p?: Priority; s?: Status;
    tags?: string[]; sub?: [string, boolean][]; blockedBy?: string[]; rec?: Task["recurrence"]; rem?: Task["reminder"];
    comments?: [string, string, number][];
  };
  const T = (ws: string, proj: string | null, title: string, o: Opts = {}) => {
    n++;
    const id = `k${n}`;
    const status = o.s ?? "todo";
    const comments: Comment[] = (o.comments ?? []).map(([authorId, body, hAgo], i) => ({
      id: `${id}c${i}`, authorId, body, at: hoursAgo(hAgo), parentId: null, reactions: (i === 0 ? { "👍": ["u1"] } : {}) as Record<string, string[]>, attachments: [],
    }));
    const t: Task = {
      id, workspaceId: ws, projectId: proj, title, description: o.d ?? "",
      assigneeIds: o.a ?? ["u1"], createdBy: o.by ?? "u1",
      startDate: null,
      dueDate: o.due === null ? null : daysFromNow(o.due ?? 3, o.h ?? 17),
      priority: o.p ?? "medium", status, tags: o.tags ?? [],
      subtasks: (o.sub ?? []).map(([title, done], i) => ({ id: `${id}s${i}`, title, done })),
      attachments: [], comments, blockedBy: o.blockedBy ?? [],
      reminder: o.rem ?? "none", reminderCustomMin: 30, remindedAt: null, overdueNotifiedAt: status === "done" ? null : hoursAgo(1),
      recurrence: o.rec ?? null,
      createdAt: hoursAgo(24 * (8 + (n % 9))), updatedAt: hoursAgo(n % 30),
      completedAt: status === "done" ? hoursAgo(n % 48 + 2) : null, deletedAt: null,
    };
    tasks.push(t);
    return id;
  };

  // ---------- Trackademic ----------
  const wire = T("t1", "p1", "Wireframe student dashboard", { a: ["u1"], due: -4, p: "high", s: "done", tags: ["design"], sub: [["Low-fi sketches", true], ["Mid-fi frames", true]] });
  const nav = T("t1", "p1", "Navbar component", { a: ["u3"], due: -1, p: "medium", s: "done", tags: ["frontend"], by: "u1" });
  const dash = T("t1", "p1", "Design Login Page", {
    d: "Create the new login screen following the v2 tokens. Include SSO buttons, remember-me and error states.",
    a: ["u1", "u3"], due: 0, h: 23, p: "high", s: "in_progress", tags: ["design", "auth"],
    sub: [["Wireframe", true], ["Navigation", true], ["Dashboard handoff", false], ["Responsive testing", false]],
    comments: [["u3", "Pushed the first pass of the layout to the branch.", 20], ["u1", "@Kurt looks great — can we tighten the spacing on mobile?", 6]],
    rem: "1h",
  });
  const api = T("t1", "p2", "Authentication API", { d: "JWT sessions, refresh tokens and rate limiting.", a: ["u2"], due: 1, p: "urgent", s: "in_progress", tags: ["backend", "auth"], by: "u2", sub: [["Database schema", true], ["Login endpoint", true], ["Refresh tokens", false], ["Rate limiting", false]], comments: [["u2", "Schema is merged. Working on refresh tokens now.", 10]] });
  T("t1", "p2", "Frontend Integration", { d: "Wire the login UI to the new auth endpoints.", a: ["u3"], due: 3, p: "high", s: "todo", tags: ["frontend", "auth"], blockedBy: [api], by: "u2" });
  T("t1", "p2", "Forgot password flow", { a: ["u4"], due: 5, p: "medium", s: "todo", tags: ["auth"], by: "u2", sub: [["Email template", false], ["Reset endpoint", false], ["UI", false]] });
  T("t1", "p2", "Database Setup", { d: "Provision Postgres, migrations and seed scripts.", a: ["u2"], due: -2, p: "high", s: "review", tags: ["backend"], by: "u2", comments: [["u2", "Uploaded database.sql — ready for review.", 3]] });
  T("t1", "p1", "Progress widget", { a: ["u3", "u1"], due: 2, p: "medium", s: "todo", tags: ["frontend"] });
  T("t1", "p1", "Usability test round 2", { a: ["u5"], due: 4, p: "medium", s: "todo", tags: ["research"], sub: [["Recruit 5 students", true], ["Script", false], ["Sessions", false]] });
  T("t1", "p1", "Accessibility audit", { a: ["u5"], due: 8, p: "low", s: "todo", tags: ["qa"] });
  T("t1", "p1", "Dark mode tokens", { a: ["u1"], due: 6, p: "low", s: "todo", tags: ["design"] });
  T("t1", "p1", "Adviser view", { a: ["u1", "u4"], due: -1, p: "high", s: "blocked", tags: ["design"], d: "Waiting on requirements from the adviser committee." });
  T("t1", "p3", "Expo project scaffold", { a: ["u4"], due: 2, p: "medium", s: "in_progress", tags: ["mobile"], by: "u4" });
  T("t1", "p3", "Push notifications research", { a: ["u3"], due: 9, p: "low", s: "todo", tags: ["mobile", "research"] });
  T("t1", "p3", "Mobile onboarding flow", { a: ["u1"], due: 12, p: "medium", s: "todo", tags: ["design", "mobile"] });
  T("t1", "p4", "API reference", { a: ["u2", "u5"], due: 7, p: "medium", s: "todo", tags: ["docs"] });
  T("t1", "p4", "Finalize Presentation", { a: ["u1", "u5"], due: 1, h: 12, p: "high", s: "review", tags: ["docs"], comments: [["u5", "Added the metrics slide. @Julianne can you approve?", 2]] });
  T("t1", "p4", "Getting started guide", { a: ["u5"], due: -3, p: "low", s: "done", tags: ["docs"] });
  T("t1", null, "Weekly Team Meeting", { a: ["u1", "u2", "u3", "u4", "u5"], due: 2, h: 10, p: "medium", s: "todo", tags: ["meeting"], rec: { freq: "weekly", interval: 7 }, rem: "10m" });
  T("t1", null, "Friday Progress Report", { a: ["u1"], due: 3, h: 16, p: "low", s: "todo", tags: ["report"], rec: { freq: "weekly", interval: 7 } });
  T("t1", "p1", "Settings page polish", { a: ["u3"], due: -6, p: "low", s: "done", tags: ["frontend"] });
  T("t1", "p1", "Course cards", { a: ["u3"], due: -8, p: "medium", s: "done", tags: ["frontend"] });
  T("t1", "p2", "Session storage decision", { a: ["u2"], due: -9, p: "medium", s: "done", tags: ["backend"] });

  // ---------- OOP Team ----------
  T("t2", "p5", "Class diagram", { a: ["u6", "u1"], due: -5, p: "high", s: "done", by: "u6", tags: ["uml"] });
  T("t2", "p5", "Book & Member classes", { a: ["u3"], due: -1, p: "high", s: "done", by: "u6", tags: ["java"] });
  const loan = T("t2", "p5", "Loan service", { a: ["u2"], due: 2, p: "high", s: "in_progress", by: "u6", tags: ["java"], sub: [["Borrow", true], ["Return", false], ["Fines", false]] });
  T("t2", "p5", "Swing UI", { a: ["u1", "u3"], due: 4, p: "medium", s: "todo", by: "u6", tags: ["java", "ui"], blockedBy: [loan] });
  T("t2", "p5", "Unit tests", { a: ["u2"], due: 6, p: "medium", s: "todo", by: "u6", tags: ["testing"] });
  T("t2", "p6", "Slide deck outline", { a: ["u1"], due: 1, p: "high", s: "in_progress", by: "u6", tags: ["slides"] });
  T("t2", "p6", "Demo script", { a: ["u6"], due: 3, p: "medium", s: "todo", by: "u6" });
  T("t2", "p6", "Rehearsal", { a: ["u6", "u1", "u2", "u3"], due: 4, h: 15, p: "medium", s: "todo", by: "u6", rem: "1d" });

  // ---------- Design Team ----------
  T("t3", "p7", "Color tokens", { a: ["u8"], due: -7, p: "high", s: "done", tags: ["tokens"] });
  T("t3", "p7", "Button & input components", { a: ["u8", "u1"], due: 1, p: "high", s: "in_progress", tags: ["components"], sub: [["Button", true], ["Input", true], ["Select", false]] });
  T("t3", "p7", "Glass material spec", { a: ["u1"], due: 0, h: 18, p: "urgent", s: "in_progress", tags: ["tokens"] });
  T("t3", "p7", "Component documentation", { a: ["u5"], due: 9, p: "low", s: "todo", tags: ["docs"] });
  T("t3", "p7", "Icon audit", { a: ["u8"], due: 3, p: "low", s: "review", tags: ["icons"] });
  T("t3", "p8", "Homepage hero", { a: ["u8"], due: 5, p: "medium", s: "todo", tags: ["web"] });
  T("t3", "p8", "Pricing page", { a: ["u3"], due: 10, p: "medium", s: "todo", tags: ["web"] });
  T("t3", "p8", "Moodboard", { a: ["u1", "u8"], due: -10, p: "low", s: "done", tags: ["research"] });
  T("t3", null, "Monthly Documentation Review", { a: ["u1"], due: 14, p: "low", s: "todo", rec: { freq: "monthly", interval: 30 } });

  // ---------- Marketing ----------
  T("t4", "p9", "Campaign brief", { a: ["u7"], due: -3, p: "high", s: "done", by: "u7" });
  T("t4", "p9", "Social calendar", { a: ["u4"], due: 2, p: "medium", s: "in_progress", by: "u7" });
  T("t4", "p9", "Launch video storyboard", { a: ["u8"], due: 6, p: "medium", s: "todo", by: "u7" });
  T("t4", "p9", "Newsletter draft", { a: ["u4", "u7"], due: 8, p: "low", s: "todo", by: "u7" });
  T("t4", "p10", "Brand guidelines PDF", { a: ["u8"], due: -4, p: "high", s: "done", by: "u7" });

  // ---------- Personal ----------
  T(pw, "p11", "Finish database documentation", { a: ["u1"], due: 0, h: 21, p: "high", s: "in_progress", tags: ["thesis"] });
  T(pw, "p11", "Read chapter 5 — related work", { a: ["u1"], due: 2, p: "medium", s: "todo", tags: ["thesis"] });
  T(pw, "p11", "Email adviser about survey", { a: ["u1"], due: 0, h: 14, p: "medium", s: "todo", tags: ["thesis"] });
  T(pw, "p11", "Chapter 3 revisions", { a: ["u1"], due: -2, p: "urgent", s: "todo", tags: ["thesis"], sub: [["Methodology", true], ["Sampling", false], ["Instruments", false]] });
  T(pw, "p12", "Pay tuition balance", { a: ["u1"], due: 3, p: "high", s: "todo", rem: "1d" });
  T(pw, "p12", "Buy groceries", { a: ["u1"], due: 0, h: 19, p: "low", s: "todo" });
  T(pw, "p12", "Gym", { a: ["u1"], due: 1, h: 7, p: "low", s: "todo", rec: { freq: "daily", interval: 1 } });
  T(pw, "p12", "Renew library card", { a: ["u1"], due: -5, p: "low", s: "done" });
  T(pw, null, "Plan weekend trip", { a: ["u1"], due: null, p: "low", s: "todo" });

  const nameOf = (id: string) => users.find((u) => u.id === id)!.name.split(" ")[0];
  void nameOf;

  const A = (ws: string, actorId: string, text: string, h: number, taskId: string | null = null, projectId: string | null = null): ActivityEvent => ({
    id: `a${Math.random().toString(36).slice(2, 9)}`, workspaceId: ws, actorId, text, taskId, projectId, at: hoursAgo(h),
  });
  const activity: ActivityEvent[] = [
    A("t1", "u5", 'commented on "Finalize Presentation"', 2),
    A("t1", "u2", 'submitted "Database Setup" for review', 3),
    A("t1", "u2", "uploaded database.sql", 3.2),
    A("t1", "u1", 'commented on "Design Login Page"', 6),
    A("t1", "u3", 'completed "Navbar component"', 9, nav),
    A("t1", "u2", 'commented on "Authentication API"', 10, api),
    A("t1", "u2", 'changed "Authentication API": To Do → In Progress', 22, api),
    A("t1", "u1", 'assigned Kurt to "Design Login Page"', 30, dash),
    A("t1", "u1", 'created "Design Login Page"', 31, dash),
    A("t1", "u1", 'completed "Wireframe student dashboard"', 50, wire),
    A("t1", "u4", "joined the team", 80),
    A("t2", "u6", 'created "Rehearsal"', 5),
    A("t2", "u3", 'completed "Book & Member classes"', 12),
    A("t2", "u2", 'changed "Loan service": To Do → In Progress', 26),
    A("t3", "u8", 'submitted "Icon audit" for review', 4),
    A("t3", "u1", 'started "Glass material spec"', 8),
    A("t3", "u8", 'completed "Color tokens"', 60),
    A("t4", "u4", 'changed "Social calendar": To Do → In Progress', 7),
    A("t4", "u7", "archived Brand Refresh", 30),
    A(pw, "u1", 'created "Finish database documentation"', 20),
    A(pw, "u1", 'completed "Renew library card"', 70),
  ];

  const V = (ws: string, title: string, url: string, category: string, o: Partial<VaultItem> = {}): VaultItem => ({
    id: `v${Math.random().toString(36).slice(2, 9)}`, workspaceId: ws, title, url, description: "", category,
    addedBy: "u1", at: hoursAgo(24 * (2 + Math.floor(Math.random() * 20))), projectId: null, tags: [],
    pinned: false, favorite: false, notes: "", deletedAt: null, ...o,
  });
  const vault: VaultItem[] = [
    V("t1", "Trackademic UI System", "https://www.figma.com/file/trackademic-ui", "Design", { pinned: true, projectId: "p1", description: "Main UI design file — components and screens.", tags: ["ui"] }),
    V("t1", "Project Folder", "https://drive.google.com/drive/folders/trackademic", "Assets", { pinned: true, addedBy: "u2", description: "Shared assets and exports." }),
    V("t1", "Main Repository", "https://github.com/trackademic/app", "Development", { pinned: true, addedBy: "u2", projectId: "p2" }),
    V("t1", "Documentation", "https://docs.google.com/document/d/trackademic-docs", "Documents", { pinned: true, addedBy: "u5", projectId: "p4" }),
    V("t1", "Sprint Board Notes", "https://www.notion.so/trackademic/sprint-notes", "Documents", { addedBy: "u5" }),
    V("t1", "Weekly Sync", "https://meet.google.com/abc-defg-hij", "Meetings", { addedBy: "u1", favorite: true, notes: "Tuesdays 10:00" }),
    V("t1", "API Spec", "https://docs.google.com/spreadsheets/d/api-spec", "Development", { addedBy: "u2", projectId: "p2" }),
    V("t1", "Usability Findings", "https://docs.google.com/presentation/d/usability-r1", "Research", { addedBy: "u5", projectId: "p1" }),
    V("t1", "Material Design 3", "https://m3.material.io", "References", { addedBy: "u3" }),
    V("t1", "Mobile Repo", "https://github.com/trackademic/mobile", "Development", { addedBy: "u4", projectId: "p3" }),
    V("t2", "Library System Repo", "https://github.com/oop-team/library-system", "Development", { pinned: true, addedBy: "u6" }),
    V("t2", "Final Presentation Slides", "https://docs.google.com/presentation/d/oop-final", "Documents", { pinned: true, addedBy: "u6", projectId: "p6" }),
    V("t2", "Java Docs", "https://docs.oracle.com/en/java/javase/21/docs/api/", "References", { addedBy: "u3" }),
    V("t2", "Class Meeting", "https://zoom.us/j/99887766", "Meetings", { addedBy: "u6" }),
    V("t3", "Design System v2", "https://www.figma.com/file/design-system-v2", "Design", { pinned: true, projectId: "p7" }),
    V("t3", "Brand Assets", "https://www.dropbox.com/sh/brand-assets", "Assets", { pinned: true, addedBy: "u8" }),
    V("t3", "Website Moodboard", "https://www.canva.com/design/moodboard", "Design", { addedBy: "u8", projectId: "p8" }),
    V("t3", "Research Repository", "https://www.notion.so/design/research", "Research", { addedBy: "u5" }),
    V("t4", "Campaign Tracker", "https://docs.google.com/spreadsheets/d/q4-campaign", "Documents", { pinned: true, addedBy: "u7", projectId: "p9" }),
    V("t4", "Brand Guidelines", "https://onedrive.live.com/brand-guidelines", "Assets", { pinned: true, addedBy: "u7" }),
    V(pw, "My Google Drive", "https://drive.google.com/drive/my-drive", "Documents", { pinned: true }),
    V(pw, "School Portal", "https://portal.university.edu", "Other", { pinned: true }),
    V(pw, "Personal Notes", "https://www.notion.so/julianne/notes", "Documents", { pinned: true }),
    V(pw, "Thesis References", "https://scholar.google.com", "References", { projectId: "p11" }),
  ];

  const N = (type: AppNotification["type"], title: string, body: string, h: number, read = false, ws: string | null = "t1", taskId: string | null = null): AppNotification => ({
    id: `n${Math.random().toString(36).slice(2, 9)}`, userId: "u1", type, title, body, at: hoursAgo(h), read, taskId, workspaceId: ws,
  });
  const notifications: AppNotification[] = [
    N("mention", "Maya mentioned you", '"@Julianne can you approve?" — Finalize Presentation', 2),
    N("review", "Review requested", 'CJ submitted "Database Setup" for review', 3),
    N("due_soon", "Due today", '"Design Login Page" is due today at 11:00 PM', 5, false, "t1", dash),
    N("assigned", "Task assigned to you", 'Daniel assigned you "Slide deck outline"', 20, true, "t2"),
    N("member", "New team member", "Alex Morgan joined Trackademic", 80, true),
    N("project", "Project update", "Brand Refresh was archived", 30, true, "t4"),
    N("deadline", "Deadline changed", '"Rehearsal" moved to later this week', 40, true, "t2"),
  ];

  const announcements: Announcement[] = [
    { id: "an1", workspaceId: "t1", authorId: "u1", title: "Final presentation moved to Friday", body: "We'll present to the advisers on Friday, 2 PM. Please have your sections ready by Thursday night.", important: true, at: hoursAgo(14) },
    { id: "an2", workspaceId: "t2", authorId: "u6", title: "Code freeze next week", body: "No new features after Monday — bugfixes only.", important: false, at: hoursAgo(28) },
    { id: "an3", workspaceId: "t3", authorId: "u8", title: "Design crit moved to Thursdays", body: "Same time, new day.", important: false, at: hoursAgo(50) },
  ];

  const inbox: InboxItem[] = [
    { id: "i1", userId: "u1", text: "Finish database documentation outline", at: hoursAgo(3) },
    { id: "i2", userId: "u1", text: "Ask CJ about the staging URL", at: hoursAgo(9) },
    { id: "i3", userId: "u1", text: "Look into calendar sync", at: hoursAgo(26) },
  ];

  const vaultCategories: Record<string, string[]> = {};
  for (const ws of ["t1", "t2", "t3", "t4", pw]) vaultCategories[ws] = [...DEFAULT_VAULT_CATEGORIES];

  const rec = <T extends { id: string }>(arr: T[]) => Object.fromEntries(arr.map((x) => [x.id, x])) as Record<string, T>;

  return {
    users: rec(users),
    teams: rec(teams),
    memberships,
    projects: rec(projects),
    tasks: rec(tasks),
    activity,
    vault: rec(vault),
    vaultCategories,
    notifications,
    announcements,
    inbox,
    invites: [] as import("./types").Invite[],
  };
}
