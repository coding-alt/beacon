"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  KanbanSquare,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Pencil,
  Plus,
  Star,
  Trash2,
  Users,
  X
} from "lucide-react";
import { apiRequest, AuthResponse, Board, User, Workspace } from "@/lib/api";

const TOKEN_KEY = "beacon_token";

export function HomePage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [passwordOpen, setPasswordOpen] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(TOKEN_KEY);
    if (!saved) {
      setLoading(false);
      return;
    }

    setToken(saved);
    void bootstrap(saved);
  }, []);

  useEffect(() => {
    if (!token || !selectedWorkspaceId) {
      return;
    }
    void loadBoards(token, selectedWorkspaceId);
  }, [token, selectedWorkspaceId]);

  async function bootstrap(authToken: string) {
    try {
      setLoading(true);
      const [me, workspaceList] = await Promise.all([
        apiRequest<User>("/me", authToken),
        apiRequest<Workspace[]>("/workspaces", authToken)
      ]);
      setUser(me);
      setWorkspaces(workspaceList);
      setSelectedWorkspaceId(workspaceList[0]?.id ?? null);
      setError("");
    } catch (err) {
      window.localStorage.removeItem(TOKEN_KEY);
      setToken(null);
      setUser(null);
      setError(err instanceof Error ? err.message : "登录状态已失效");
    } finally {
      setLoading(false);
    }
  }

  async function loadBoards(authToken: string, workspaceId: number) {
    try {
      const boardList = await apiRequest<Board[]>(`/workspaces/${workspaceId}/boards`, authToken);
      setBoards(boardList);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "无法加载看板");
    }
  }

  function handleAuthed(response: AuthResponse) {
    window.localStorage.setItem(TOKEN_KEY, response.token);
    setToken(response.token);
    setUser(response.user);
    void bootstrap(response.token);
  }

  function logout() {
    window.localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
    setWorkspaces([]);
    setBoards([]);
    setSelectedWorkspaceId(null);
  }

  function handleWorkspaceDeleted(workspaceId: number) {
    const next = workspaces.filter((workspace) => workspace.id !== workspaceId);
    setWorkspaces(next);
    if (selectedWorkspaceId === workspaceId) {
      setSelectedWorkspaceId(next[0]?.id ?? null);
      setBoards([]);
    }
  }

  function handleWorkspaceUpdated(workspace: Workspace) {
    setWorkspaces((current) => current.map((item) => (item.id === workspace.id ? workspace : item)));
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-700">
        <LoaderCircle className="mr-2 h-5 w-5 animate-spin" />
        正在点亮 Beacon
      </main>
    );
  }

  if (!token || !user) {
    return <AuthScreen onAuthed={handleAuthed} initialError={error} />;
  }

  return (
    <main className="min-h-screen bg-[#f6f7f9]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-md bg-teal-700 text-white">
              <KanbanSquare className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-950">Beacon</h1>
              <p className="text-sm text-slate-500">聚焦目标，推动项目向前</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-slate-900">{user.name}</p>
              <p className="text-xs text-slate-500">{user.email}</p>
            </div>
            <button
              type="button"
              onClick={() => setPasswordOpen(true)}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              title="修改密码"
            >
              <LockKeyhole className="h-4 w-4" />
              修改密码
            </button>
            <button
              type="button"
              onClick={logout}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              title="退出登录"
            >
              <LogOut className="h-4 w-4" />
              退出
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-6 px-5 py-6 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-4">
          <WorkspacePanel
            token={token}
            workspaces={workspaces}
            selectedWorkspaceId={selectedWorkspaceId}
            onSelect={setSelectedWorkspaceId}
            onCreated={(workspace) => {
              setWorkspaces((current) => [workspace, ...current]);
              setSelectedWorkspaceId(workspace.id);
            }}
            onUpdated={handleWorkspaceUpdated}
            onDeleted={handleWorkspaceDeleted}
          />
        </aside>

        <section className="min-w-0">
          {error ? (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold text-slate-950">项目看板</h2>
              <p className="mt-1 text-sm text-slate-500">创建看板后即可进入拖拽式协作视图。</p>
            </div>
            {selectedWorkspaceId ? (
              <CreateBoardForm
                token={token}
                workspaceId={selectedWorkspaceId}
                onCreated={(board) => {
                  setBoards((current) => [board, ...current]);
                  router.push(`/boards/${board.id}`);
                }}
              />
            ) : null}
          </div>

          {selectedWorkspaceId ? (
            <BoardGrid boards={boards} onOpen={(boardId) => router.push(`/boards/${boardId}`)} />
          ) : (
            <EmptyState title="还没有工作区" body="先创建一个工作区，团队项目会收纳在其中。" />
          )}
        </section>
      </section>

      {passwordOpen ? <ChangePasswordModal token={token} onClose={() => setPasswordOpen(false)} /> : null}
    </main>
  );
}

function ChangePasswordModal({ token, onClose }: { token: string; onClose: () => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (newPassword.length < 8) {
      setError("新密码至少需要 8 个字符");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("两次输入的新密码不一致");
      return;
    }
    if (currentPassword === newPassword) {
      setError("新密码不能与当前密码相同");
      return;
    }

    setSubmitting(true);
    try {
      await apiRequest<{ status: string }>("/me/password", token, {
        method: "PATCH",
        body: JSON.stringify({ currentPassword, newPassword })
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage("密码已修改");
    } catch (err) {
      setError(err instanceof Error ? err.message : "无法修改密码");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/55 px-4 py-10">
      <form onSubmit={submit} className="w-full max-w-md rounded-md bg-white shadow-panel">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">修改密码</h2>
            <p className="mt-1 text-sm text-slate-500">修改后请使用新密码登录。</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-slate-500 hover:bg-slate-100"
            title="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">当前密码</span>
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15"
              autoComplete="current-password"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">新密码</span>
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15"
              autoComplete="new-password"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">确认新密码</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15"
              autoComplete="new-password"
            />
          </label>

          {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
          {message ? <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
            保存
          </button>
        </div>
      </form>
    </div>
  );
}

function AuthScreen({
  onAuthed,
  initialError
}: {
  onAuthed: (response: AuthResponse) => void;
  initialError: string;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(initialError);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const response = await apiRequest<AuthResponse>(`/auth/${mode}`, null, {
        method: "POST",
        body: JSON.stringify(mode === "register" ? { name, email, password } : { email, password })
      });
      onAuthed(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "认证失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen bg-slate-100 lg:grid-cols-[minmax(0,1fr)_460px]">
      <section className="flex min-h-[42vh] items-end bg-[linear-gradient(130deg,#0f766e_0%,#1d4ed8_48%,#111827_100%)] px-6 py-8 text-white lg:min-h-screen lg:px-12">
        <div className="max-w-2xl">
          <div className="mb-5 inline-flex items-center gap-2 rounded-md bg-white/12 px-3 py-2 text-sm backdrop-blur">
            <KanbanSquare className="h-4 w-4" />
            Beacon
          </div>
          <h1 className="text-4xl font-semibold tracking-normal md:text-6xl">Beacon</h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-slate-100 md:text-lg">
            像 Trello 一样拖拽任务状态，同时围绕团队目标、成员协作和部署迁移做了更适合自托管的基础设计。
          </p>
        </div>
      </section>

      <section className="flex items-center justify-center px-5 py-10">
        <form onSubmit={submit} className="w-full max-w-sm rounded-md border border-slate-200 bg-white p-6 shadow-panel">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-slate-950">{mode === "login" ? "登录" : "注册"}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {mode === "login" ? "回到你的团队看板。" : "创建账号后会自动生成默认工作区。"}
            </p>
          </div>

          <div className="space-y-4">
            {mode === "register" ? (
              <label className="block">
                <span className="text-sm font-medium text-slate-700">姓名</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="mt-1 h-11 w-full rounded-md border border-slate-300 px-3 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15"
                  autoComplete="name"
                />
              </label>
            ) : null}

            <label className="block">
              <span className="text-sm font-medium text-slate-700">邮箱</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-1 h-11 w-full rounded-md border border-slate-300 px-3 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15"
                autoComplete="email"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">密码</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-1 h-11 w-full rounded-md border border-slate-300 px-3 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
            </label>
          </div>

          {error ? <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

          <button
            type="submit"
            disabled={submitting}
            className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
            {mode === "login" ? "登录 Beacon" : "创建账号"}
          </button>

          <button
            type="button"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError("");
            }}
            className="mt-4 w-full text-sm font-medium text-teal-700 hover:text-teal-900"
          >
            {mode === "login" ? "没有账号？立即注册" : "已有账号？返回登录"}
          </button>
        </form>
      </section>
    </main>
  );
}

function WorkspacePanel({
  token,
  workspaces,
  selectedWorkspaceId,
  onSelect,
  onCreated,
  onUpdated,
  onDeleted
}: {
  token: string;
  workspaces: Workspace[];
  selectedWorkspaceId: number | null;
  onSelect: (id: number) => void;
  onCreated: (workspace: Workspace) => void;
  onUpdated: (workspace: Workspace) => void;
  onDeleted: (workspaceId: number) => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");

  async function createWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      return;
    }

    try {
      const workspace = await apiRequest<Workspace>("/workspaces", token, {
        method: "POST",
        body: JSON.stringify({ name })
      });
      setName("");
      setError("");
      onCreated(workspace);
    } catch (err) {
      setError(err instanceof Error ? err.message : "无法创建工作区");
    }
  }

  async function deleteWorkspace(workspace: Workspace) {
    const confirmed = window.confirm(`确定删除工作区「${workspace.name}」吗？其中的看板、列表和卡片都会被删除。`);
    if (!confirmed) {
      return;
    }

    try {
      await apiRequest<{ deleted: boolean }>(`/workspaces/${workspace.id}`, token, {
        method: "DELETE"
      });
      setError("");
      onDeleted(workspace.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "无法删除工作区");
    }
  }

  async function renameWorkspace(workspace: Workspace) {
    const nextName = editingName.trim();
    if (!nextName) {
      setError("工作区名称不能为空");
      return;
    }
    if (nextName === workspace.name) {
      setEditingId(null);
      setEditingName("");
      return;
    }

    try {
      const updated = await apiRequest<Workspace>(`/workspaces/${workspace.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ name: nextName })
      });
      setEditingId(null);
      setEditingName("");
      setError("");
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "无法重命名工作区");
    }
  }

  function startEditing(workspace: Workspace) {
    setEditingId(workspace.id);
    setEditingName(workspace.name);
    setError("");
  }

  function cancelEditing() {
    setEditingId(null);
    setEditingName("");
  }

  return (
    <div className="rounded-md border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
        <Users className="h-4 w-4 text-blue-700" />
        工作区
      </div>
      <div className="space-y-1">
        {workspaces.map((workspace) => (
          <div
            key={workspace.id}
            className={`group flex items-center gap-1 rounded-md ${
              selectedWorkspaceId === workspace.id
                ? "bg-teal-50 text-teal-800"
                : "text-slate-700 hover:bg-slate-50"
            }`}
          >
            {editingId === workspace.id ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void renameWorkspace(workspace);
                }}
                className="flex min-w-0 flex-1 items-center gap-1 p-1"
              >
                <input
                  value={editingName}
                  onChange={(event) => setEditingName(event.target.value)}
                  autoFocus
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      cancelEditing();
                    }
                  }}
                  className="h-8 min-w-0 flex-1 rounded-md border border-teal-300 bg-white px-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-teal-700/15"
                />
                <button
                  type="submit"
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-teal-700 hover:bg-teal-100"
                  title="保存工作区名称"
                >
                  <Check className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={cancelEditing}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-500 hover:bg-slate-100"
                  title="取消"
                >
                  <X className="h-4 w-4" />
                </button>
              </form>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => onSelect(workspace.id)}
                  className={`min-w-0 flex-1 truncate px-3 py-2 text-left text-sm ${
                    selectedWorkspaceId === workspace.id ? "font-semibold" : ""
                  }`}
                >
                  {workspace.name}
                </button>
                <button
                  type="button"
                  onClick={() => startEditing(workspace)}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-500 opacity-70 hover:bg-slate-100 hover:text-slate-800 sm:opacity-0 sm:group-hover:opacity-100"
                  title="重命名工作区"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => void deleteWorkspace(workspace)}
                  className="mr-1 grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-500 opacity-70 hover:bg-red-50 hover:text-red-700 sm:opacity-0 sm:group-hover:opacity-100"
                  title="删除工作区"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      <form onSubmit={createWorkspace} className="mt-4 flex gap-2">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="新工作区"
          className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15"
        />
        <button
          type="submit"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-slate-900 text-white hover:bg-slate-700"
          title="创建工作区"
        >
          <Plus className="h-4 w-4" />
        </button>
      </form>
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
    </div>
  );
}

function CreateBoardForm({
  token,
  workspaceId,
  onCreated
}: {
  token: string;
  workspaceId: number;
  onCreated: (board: Board) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#0f766e");
  const [error, setError] = useState("");

  async function createBoard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      return;
    }

    try {
      const board = await apiRequest<Board>(`/workspaces/${workspaceId}/boards`, token, {
        method: "POST",
        body: JSON.stringify({ name, color })
      });
      setName("");
      setOpen(false);
      setError("");
      onCreated(board);
    } catch (err) {
      setError(err instanceof Error ? err.message : "无法创建看板");
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center gap-2 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
      >
        <Plus className="h-4 w-4" />
        新建看板
      </button>
    );
  }

  return (
    <form onSubmit={createBoard} className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-white p-2">
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="看板名称"
        className="h-9 min-w-[180px] rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-teal-700"
      />
      <input
        type="color"
        value={color}
        onChange={(event) => setColor(event.target.value)}
        className="h-9 w-10 rounded-md border border-slate-300 bg-white p-1"
        title="看板颜色"
      />
      <button type="submit" className="h-9 rounded-md bg-slate-900 px-3 text-sm font-medium text-white">
        创建
      </button>
      <button type="button" onClick={() => setOpen(false)} className="h-9 rounded-md px-3 text-sm text-slate-600">
        取消
      </button>
      {error ? <span className="text-sm text-red-700">{error}</span> : null}
    </form>
  );
}

function BoardGrid({ boards, onOpen }: { boards: Board[]; onOpen: (boardId: number) => void }) {
  const sorted = useMemo(() => [...boards].sort((a, b) => Number(b.starred) - Number(a.starred)), [boards]);

  if (sorted.length === 0) {
    return <EmptyState title="还没有看板" body="创建一个看板后，默认会生成未开始、进行中、已完成三列。" />;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {sorted.map((board) => (
        <button
          type="button"
          key={board.id}
          onClick={() => onOpen(board.id)}
          className="group min-h-36 rounded-md border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-panel"
        >
          <div className="mb-5 h-2 rounded-full" style={{ backgroundColor: board.color }} />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-lg font-semibold text-slate-950">{board.name}</h3>
              <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">
                {board.description || "拖拽任务卡片，跟进项目推进。"}
              </p>
            </div>
            {board.starred ? <Star className="h-5 w-5 shrink-0 fill-amber-400 text-amber-500" /> : null}
          </div>
        </button>
      ))}
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-md border border-dashed border-slate-300 bg-white px-5 py-12 text-center">
      <KanbanSquare className="mx-auto h-8 w-8 text-slate-400" />
      <h3 className="mt-3 text-base font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 text-sm text-slate-500">{body}</p>
    </div>
  );
}
