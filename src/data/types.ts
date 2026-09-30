export type Role = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
export type Priority = "urgent" | "high" | "medium" | "low";
export type Status = "todo" | "in_progress" | "review" | "done" | "blocked";
export type Availability = "available" | "busy" | "away" | "offline";

export interface User {
  id: string;
  name: string;
  username: string;
  email: string;
  title: string;
  hue: number; // avatar tint
  availability: Availability;
  createdAt: string;
}

export interface Team {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  category: string;
  code: string;
  createdAt: string;
  membersCanCreateTasks: boolean;
}

export interface Membership {
  teamId: string;
  userId: string;
  role: Role;
  joinedAt: string;
}

export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  memberIds: string[];
  startDate: string | null;
  deadline: string | null;
  createdAt: string;
  createdBy: string;
  archivedAt: string | null;
  deletedAt: string | null;
  links: { id: string; label: string; url: string }[];
}

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

export interface Attachment {
  id: string;
  name: string;
  size: number;
  uploadedBy: string;
  at: string;
}

export interface Comment {
  id: string;
  authorId: string;
  body: string;
  at: string;
  parentId: string | null;
  reactions: Record<string, string[]>;
  attachments: Attachment[];
}

export type ReminderOffset = "none" | "10m" | "1h" | "1d" | "custom";

export interface Recurrence {
  freq: "daily" | "weekly" | "monthly" | "custom";
  interval: number; // days, for custom
}

export interface Task {
  id: string;
  workspaceId: string;
  projectId: string | null;
  title: string;
  description: string;
  assigneeIds: string[];
  createdBy: string;
  startDate: string | null;
  dueDate: string | null; // ISO datetime
  priority: Priority;
  status: Status;
  tags: string[];
  subtasks: Subtask[];
  attachments: Attachment[];
  comments: Comment[];
  blockedBy: string[];
  reminder: ReminderOffset;
  reminderCustomMin: number;
  remindedAt: string | null;
  overdueNotifiedAt: string | null;
  recurrence: Recurrence | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  deletedAt: string | null;
}

export interface ActivityEvent {
  id: string;
  workspaceId: string;
  actorId: string;
  text: string; // rendered after actor name
  taskId: string | null;
  projectId: string | null;
  at: string;
}

export interface VaultItem {
  id: string;
  workspaceId: string;
  title: string;
  url: string;
  description: string;
  category: string;
  addedBy: string;
  at: string;
  projectId: string | null;
  tags: string[];
  pinned: boolean;
  favorite: boolean;
  notes: string;
  deletedAt: string | null;
}

export type NotificationType =
  | "assigned"
  | "due_soon"
  | "overdue"
  | "mention"
  | "approved"
  | "changes"
  | "member"
  | "project"
  | "deadline"
  | "review"
  | "reminder"
  | "announcement";

export interface AppNotification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  at: string;
  read: boolean;
  taskId: string | null;
  workspaceId: string | null;
}

export interface Announcement {
  id: string;
  workspaceId: string;
  authorId: string;
  title: string;
  body: string;
  important: boolean;
  at: string;
}

export interface InboxItem {
  id: string;
  userId: string;
  text: string;
  at: string;
}

export interface Invite {
  id: string;
  teamId: string;
  target: string; // email or username
  role: Role;
  invitedBy: string;
  at: string;
}
