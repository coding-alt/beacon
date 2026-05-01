export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api";

export type User = {
  id: number;
  name: string;
  email: string;
  avatarUrl?: string;
};

export type Workspace = {
  id: number;
  name: string;
  slug: string;
  ownerId: number;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceMember = {
  id: number;
  workspaceId: number;
  userId: number;
  role: "owner" | "admin" | "member";
  user: User;
};

export type Label = {
  id: number;
  boardId: number;
  name: string;
  color: string;
  position: number;
};

export type ChecklistItem = {
  id: number;
  checklistId: number;
  title: string;
  checked: boolean;
  position: number;
};

export type Checklist = {
  id: number;
  cardId: number;
  title: string;
  position: number;
  items?: ChecklistItem[];
};

export type CardComment = {
  id: number;
  cardId: number;
  userId: number;
  user: User;
  body: string;
  createdAt: string;
};

export type Card = {
  id: number;
  boardId: number;
  listId: number;
  title: string;
  description: string;
  position: number;
  coverColor?: string;
  delayed: boolean;
  priority: string;
  summary: string;
  startDate?: string | null;
  dueDate?: string | null;
  completedAt?: string | null;
  progress: string;
  latestProgressRecord: string;
  labels?: Label[];
  members?: User[];
  checklists?: Checklist[];
  comments?: CardComment[];
};

export type List = {
  id: number;
  boardId: number;
  name: string;
  position: number;
  cards?: Card[];
};

export type Board = {
  id: number;
  workspaceId: number;
  name: string;
  description: string;
  color: string;
  starred: boolean;
  visibility: string;
  lists?: List[];
  labels?: Label[];
  members?: WorkspaceMember[];
  createdAt: string;
  updatedAt: string;
};

export type AuthResponse = {
  token: string;
  user: User;
  workspace?: Workspace;
};

export async function apiRequest<T>(
  path: string,
  token: string | null,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    cache: "no-store"
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(payload?.error ?? "请求失败");
  }

  return payload as T;
}

export function boardEventsUrl(boardId: number, token: string) {
  const url = new URL(`${API_URL}/boards/${boardId}/events`);
  url.searchParams.set("token", token);
  return url.toString();
}
