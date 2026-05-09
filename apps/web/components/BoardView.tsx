"use client";

import { DragEvent, FormEvent, Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CalendarCheck,
  CalendarClock,
  ChevronRight,
  CircleCheck,
  CircleAlert,
  Clock,
  FileText,
  GripVertical,
  KanbanSquare,
  ListChecks,
  LoaderCircle,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Search,
  Star,
  Target,
  Trash2,
  UserPlus,
  Users,
  X
} from "lucide-react";
import {
  apiRequest,
  Board,
  boardEventsUrl,
  Card,
  List,
  User,
  WorkspaceMember
} from "@/lib/api";

const TOKEN_KEY = "beacon_token";
const LIST_DRAG_TYPE = "application/x-beacon-list";
const CARD_DRAG_TYPE = "application/x-beacon-card";
type ListDropTarget = number | "end" | null;
const PRIORITY_OPTIONS = [
  { value: "", label: "未设置", className: "border-slate-200 bg-slate-50 text-slate-500" },
  { value: "P0", label: "P0", className: "border-red-200 bg-red-50 text-red-700" },
  { value: "P1", label: "P1", className: "border-orange-200 bg-orange-50 text-orange-700" },
  { value: "P2", label: "P2", className: "border-sky-200 bg-sky-50 text-sky-700" },
  { value: "P3", label: "P3", className: "border-slate-200 bg-slate-100 text-slate-700" }
];
const LEGACY_PRIORITY_MAP: Record<string, string> = {
  "重要且紧急": "P0",
  "重要不紧急": "P1",
  "紧急不重要": "P2",
  "不重要不紧急": "P3"
};

export function BoardView({ boardId }: { boardId: number }) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [selectedCardId, setSelectedCardId] = useState<number | null>(null);
  const [draggingCardId, setDraggingCardId] = useState<number | null>(null);
  const [draggingListId, setDraggingListId] = useState<number | null>(null);
  const [listDropTargetId, setListDropTargetId] = useState<ListDropTarget>(null);
  const dragCardRef = useRef<{ cardId: number } | null>(null);
  const dragListRef = useRef<{ listId: number } | null>(null);

  const loadBoard = useCallback(
    async (authToken: string, showSpinner = true) => {
      try {
        if (showSpinner) {
          setLoading(true);
        }
        const next = await apiRequest<Board>(`/boards/${boardId}`, authToken);
        setBoard(next);
        setError("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "无法加载看板");
      } finally {
        if (showSpinner) {
          setLoading(false);
        }
      }
    },
    [boardId]
  );

  useEffect(() => {
    const saved = window.localStorage.getItem(TOKEN_KEY);
    if (!saved) {
      router.push("/");
      return;
    }
    setToken(saved);
    void loadBoard(saved);
  }, [loadBoard, router]);

  useEffect(() => {
    if (!token) {
      return;
    }

    const source = new EventSource(boardEventsUrl(boardId, token));
    let first = true;
    source.addEventListener("beacon", () => {
      if (first) {
        first = false;
        return;
      }
      void loadBoard(token, false);
    });

    return () => source.close();
  }, [boardId, loadBoard, token]);

  const selectedCard = useMemo(() => {
    if (!board || selectedCardId == null) {
      return null;
    }
    return allCards(board).find((card) => card.id === selectedCardId) ?? null;
  }, [board, selectedCardId]);

  const filteredLists = useMemo(() => {
    if (!board?.lists) {
      return [];
    }

    const term = search.trim().toLowerCase();
    return board.lists.map((list) => ({
      ...list,
      cards: (list.cards ?? []).filter((card) => {
        const normalizedPriority = normalizePriority(card.priority ?? "");
        const matchesText =
          term === "" ||
          card.title.toLowerCase().includes(term) ||
          card.description.toLowerCase().includes(term) ||
          card.summary.toLowerCase().includes(term);
        const matchesPriority = priorityFilter === "all" || normalizedPriority === priorityFilter;
        return matchesText && matchesPriority;
      })
    }));
  }, [board, priorityFilter, search]);

  async function mutate(path: string, body: unknown, method: "POST" | "PATCH" | "DELETE" = "PATCH") {
    if (!token || !board) {
      return undefined;
    }

    const updated = await apiRequest<Board>(path, token, {
      method,
      body: method === "DELETE" ? undefined : JSON.stringify(body ?? {})
    });
    setBoard(updated);
    return updated;
  }

  async function createList(name: string) {
    await mutate(`/boards/${boardId}/lists`, { name }, "POST");
  }

  async function createCard(listId: number, title: string) {
    await mutate(`/boards/${boardId}/cards`, { listId, title }, "POST");
  }

  async function moveList(listId: number, beforeListId?: number) {
    if (!board || !token) {
      return;
    }

    const next = moveListLocally(board, listId, beforeListId);
    if (!next) {
      return;
    }
    setBoard(next);

    try {
      const updated = await apiRequest<Board>(`/boards/${boardId}/lists/reorder`, token, {
        method: "PATCH",
        body: JSON.stringify({
          lists: (next.lists ?? []).map((list) => ({
            id: list.id,
            position: list.position
          }))
        })
      });
      setBoard(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "无法移动列表");
      void loadBoard(token, false);
    }
  }

  async function moveCard(cardId: number, targetListId: number, beforeCardId?: number) {
    if (!board || !token) {
      return;
    }

    const next = moveCardLocally(board, cardId, targetListId, beforeCardId);
    if (!next) {
      return;
    }
    setBoard(next);

    try {
      const updated = await apiRequest<Board>(`/boards/${boardId}/cards/reorder`, token, {
        method: "PATCH",
        body: JSON.stringify({
          cards: allCards(next).map((card) => ({
            id: card.id,
            listId: card.listId,
            position: card.position
          }))
        })
      });
      setBoard(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "无法移动卡片");
      void loadBoard(token, false);
    }
  }

  function clearCardDrag() {
    dragCardRef.current = null;
    setDraggingCardId(null);
  }

  function clearListDrag() {
    dragListRef.current = null;
    setDraggingListId(null);
    setListDropTargetId(null);
  }

  function handleListPlaceholderDragOver(event: DragEvent, target: Exclude<ListDropTarget, null>) {
    if (!hasDragType(event, LIST_DRAG_TYPE)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setListDropTargetId(target);
  }

  function handleListPlaceholderDrop(event: DragEvent, beforeListId?: number) {
    if (!hasDragType(event, LIST_DRAG_TYPE)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const dragged = dragListRef.current;
    if (dragged) {
      void moveList(dragged.listId, beforeListId);
    }
    clearListDrag();
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-700">
        <LoaderCircle className="mr-2 h-5 w-5 animate-spin" />
        正在加载看板
      </main>
    );
  }

  if (!board || !token) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-5">
        <div className="rounded-md border border-red-200 bg-white p-6 text-center shadow-panel">
          <p className="text-sm text-red-700">{error || "看板不存在或无权访问"}</p>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          >
            返回首页
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col bg-slate-100">
      <header className="border-b border-white/20 text-white" style={{ backgroundColor: board.color }}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => router.push("/")}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-white/15 hover:bg-white/25"
              title="返回工作台"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <KanbanSquare className="h-5 w-5 shrink-0" />
                <h1 className="truncate text-xl font-semibold">{board.name}</h1>
                {board.starred ? <Star className="h-5 w-5 fill-amber-300 text-amber-300" /> : null}
              </div>
              <p className="truncate text-sm text-white/80">{board.description || "团队项目看板"}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void mutate(`/boards/${board.id}`, { starred: !board.starred })}
              className="grid h-10 w-10 place-items-center rounded-md bg-white/15 hover:bg-white/25"
              title={board.starred ? "取消星标" : "设为星标"}
            >
              <Star className={`h-5 w-5 ${board.starred ? "fill-amber-300 text-amber-300" : ""}`} />
            </button>
            <InviteMember token={token} board={board} onUpdated={(next) => setBoard(next)} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 px-4 pb-4">
          <label className="relative min-w-[220px] flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索卡片"
              className="h-10 w-full rounded-md border border-white/20 bg-white pl-9 pr-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-white/50"
            />
          </label>
          <label className="relative min-w-[150px]">
            <Target className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <select
              value={priorityFilter}
              onChange={(event) => setPriorityFilter(event.target.value)}
              className="h-10 w-full appearance-none rounded-md border border-white/20 bg-white pl-9 pr-8 text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-white/50"
            >
              <option value="all">全部优先级</option>
              {PRIORITY_OPTIONS.filter((option) => option.value).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronRight className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 rotate-90 -translate-y-1/2 text-slate-400" />
          </label>
          <MemberStrip members={board.members ?? []} />
        </div>
      </header>

      {error ? (
        <div className="mx-4 mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <section
        className="beacon-scrollbar flex flex-1 gap-4 overflow-x-auto px-4 py-5"
        onDragOver={(event) => {
          if (hasDragType(event, LIST_DRAG_TYPE)) {
            event.preventDefault();
            setListDropTargetId("end");
          }
        }}
        onDrop={(event) => {
          if (!hasDragType(event, LIST_DRAG_TYPE)) {
            return;
          }
          event.preventDefault();
          const dragged = dragListRef.current;
          if (dragged) {
            void moveList(dragged.listId);
          }
          clearListDrag();
        }}
      >
        {filteredLists.map((list) => (
          <Fragment key={list.id}>
            {draggingListId != null && listDropTargetId === list.id && draggingListId !== list.id ? (
              <ListDropPlaceholder
                onDragOver={(event) => handleListPlaceholderDragOver(event, list.id)}
                onDrop={(event) => handleListPlaceholderDrop(event, list.id)}
              />
            ) : null}
            <BoardList
              list={list}
              draggingCardId={draggingCardId}
              draggingListId={draggingListId}
              isListDropTarget={listDropTargetId === list.id && draggingListId !== list.id}
              onCreateCard={createCard}
              onOpenCard={setSelectedCardId}
              onDeleteList={(listId) => void mutate(`/lists/${listId}/permanent`, null, "DELETE")}
              onRenameList={(listId, name) => void mutate(`/lists/${listId}`, { name })}
              onDragListOver={(targetListId) => setListDropTargetId(targetListId)}
              onDropListBefore={(targetListId) => {
                const dragged = dragListRef.current;
                if (dragged) {
                  void moveList(dragged.listId, targetListId);
                }
                clearListDrag();
              }}
              onDragListStart={(listId) => {
                dragListRef.current = { listId };
                setDraggingListId(listId);
                setListDropTargetId(null);
              }}
              onDragListEnd={clearListDrag}
              onDropCard={(targetListId, beforeCardId) => {
                const dragged = dragCardRef.current;
                if (dragged) {
                  void moveCard(dragged.cardId, targetListId, beforeCardId);
                }
                clearCardDrag();
              }}
              onDragCardStart={(cardId) => {
                dragCardRef.current = { cardId };
                setDraggingCardId(cardId);
              }}
              onDragCardEnd={clearCardDrag}
            />
          </Fragment>
        ))}
        {draggingListId != null && listDropTargetId === "end" ? (
          <ListDropPlaceholder
            onDragOver={(event) => handleListPlaceholderDragOver(event, "end")}
            onDrop={(event) => handleListPlaceholderDrop(event)}
          />
        ) : null}
        <CreateListColumn onCreate={createList} />
      </section>

      {selectedCard ? (
        <CardModal
          board={board}
          card={selectedCard}
          token={token}
          onClose={() => setSelectedCardId(null)}
          onUpdated={(next) => setBoard(next)}
        />
      ) : null}

    </main>
  );
}

function BoardList({
  list,
  draggingCardId,
  draggingListId,
  isListDropTarget,
  onCreateCard,
  onOpenCard,
  onDeleteList,
  onRenameList,
  onDragListOver,
  onDropListBefore,
  onDragListStart,
  onDragListEnd,
  onDropCard,
  onDragCardStart,
  onDragCardEnd
}: {
  list: List;
  draggingCardId: number | null;
  draggingListId: number | null;
  isListDropTarget: boolean;
  onCreateCard: (listId: number, title: string) => Promise<void>;
  onOpenCard: (cardId: number) => void;
  onDeleteList: (listId: number) => void;
  onRenameList: (listId: number, name: string) => void;
  onDragListOver: (targetListId: number) => void;
  onDropListBefore: (targetListId: number) => void;
  onDragListStart: (listId: number) => void;
  onDragListEnd: () => void;
  onDropCard: (targetListId: number, beforeCardId?: number) => void;
  onDragCardStart: (cardId: number) => void;
  onDragCardEnd: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(list.name);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setName(list.name);
  }, [list.name]);

  function deleteList() {
    const confirmed = window.confirm(`确定删除列表「${list.name}」吗？列表里的卡片也会被删除。`);
    if (!confirmed) {
      return;
    }
    setMenuOpen(false);
    onDeleteList(list.id);
  }

  function submitRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextName = name.trim();
    if (!nextName) {
      setName(list.name);
      setRenaming(false);
      return;
    }
    if (nextName !== list.name) {
      onRenameList(list.id, nextName);
    }
    setRenaming(false);
    setMenuOpen(false);
  }

  return (
    <div
      ref={listRef}
      className={`flex h-fit max-h-[calc(100vh-185px)] w-80 shrink-0 flex-col overflow-hidden rounded-md border border-slate-200 bg-slate-100 shadow-sm transition ${
        draggingListId === list.id ? "scale-[0.98] border-teal-300 opacity-45 shadow-none" : ""
      } ${
        isListDropTarget ? "ring-2 ring-teal-500 ring-offset-2 ring-offset-slate-100" : ""
      }`}
      onDragOver={(event) => {
        if (hasDragType(event, LIST_DRAG_TYPE) || hasDragType(event, CARD_DRAG_TYPE)) {
          event.preventDefault();
        }
        if (hasDragType(event, LIST_DRAG_TYPE)) {
          event.stopPropagation();
          onDragListOver(list.id);
        }
      }}
      onDrop={(event) => {
        event.stopPropagation();
        if (hasDragType(event, LIST_DRAG_TYPE)) {
          onDropListBefore(list.id);
          return;
        }
        onDropCard(list.id);
      }}
    >
      <div className="border-b border-slate-200 bg-white px-3 py-3">
        <div className="flex items-start justify-between gap-2">
          <button
            type="button"
            draggable
            onDragStart={(event) => {
              event.stopPropagation();
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData(LIST_DRAG_TYPE, String(list.id));
              setListDragImage(event, listRef.current, list.name, list.cards?.length ?? 0);
              onDragListStart(list.id);
            }}
            onDragEnd={onDragListEnd}
            className="mt-0.5 grid h-8 w-7 shrink-0 cursor-grab place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 active:cursor-grabbing"
            title="拖动列表排序"
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            {renaming ? (
              <form onSubmit={submitRename}>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  onBlur={() => setRenaming(false)}
                  autoFocus
                  className="h-9 w-full rounded-md border border-teal-300 px-2 text-sm font-semibold text-slate-950 outline-none focus:ring-2 focus:ring-teal-700/15"
                />
              </form>
            ) : (
              <div className="flex min-w-0 items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-teal-600" />
                <h2 className="truncate text-sm font-semibold text-slate-950">{list.name}</h2>
              </div>
            )}
            <p className="mt-1 text-xs text-slate-500">{list.cards?.length ?? 0} 张卡片</p>
          </div>
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setMenuOpen((value) => !value)}
              className="grid h-8 w-8 place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              title="列表操作"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {menuOpen ? (
              <div className="absolute right-0 top-9 z-20 w-32 rounded-md border border-slate-200 bg-white p-1 shadow-panel">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setRenaming(true);
                  }}
                  className="flex h-9 w-full items-center gap-2 rounded-md px-3 text-left text-sm text-slate-700 hover:bg-slate-50"
                >
                  <FileText className="h-4 w-4" />
                  重命名
                </button>
                <button
                  type="button"
                  onClick={deleteList}
                  className="flex h-9 w-full items-center gap-2 rounded-md px-3 text-left text-sm text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                  删除
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="beacon-scrollbar min-h-20 space-y-2 overflow-y-auto px-2 py-3">
        {(list.cards ?? []).map((card) => (
          <CardTile
            key={card.id}
            card={card}
            dragging={draggingCardId === card.id}
            onOpen={() => onOpenCard(card.id)}
            onDropBefore={() => onDropCard(list.id, card.id)}
            onDragStart={() => onDragCardStart(card.id)}
            onDragEnd={onDragCardEnd}
          />
        ))}
        {(list.cards ?? []).length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-300 bg-white/70 px-3 py-8 text-center text-sm text-slate-400">
            暂无卡片
          </div>
        ) : null}
      </div>

      <AddCardForm listId={list.id} onCreate={onCreateCard} />
    </div>
  );
}

function ListDropPlaceholder({
  onDragOver,
  onDrop
}: {
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      onDragOver={onDragOver}
      onDrop={onDrop}
      className="flex h-[calc(100vh-185px)] max-h-[720px] w-80 shrink-0 items-center justify-center rounded-md border-2 border-dashed border-teal-500 bg-teal-50/80 text-sm font-medium text-teal-700 shadow-inner"
    >
      放到这里
    </div>
  );
}

function CardTile({
  card,
  dragging,
  onOpen,
  onDropBefore,
  onDragStart,
  onDragEnd
}: {
  card: Card;
  dragging: boolean;
  onOpen: () => void;
  onDropBefore: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const statusClass = card.delayed
    ? "border-red-200 bg-red-50 text-red-700"
    : "border-emerald-200 bg-emerald-50 text-emerald-700";
  const StatusIcon = card.delayed ? CircleAlert : CircleCheck;

  return (
    <article
      draggable
      onClick={onOpen}
      onDragStart={(event) => {
        event.dataTransfer.setData(CARD_DRAG_TYPE, String(card.id));
        event.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.stopPropagation();
        onDropBefore();
      }}
      className={`cursor-pointer overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-panel ${
        dragging ? "opacity-40" : ""
      }`}
    >
      {card.coverColor ? (
        <div className="h-2 border-b border-slate-200" style={{ backgroundColor: card.coverColor }} />
      ) : null}
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="min-w-0 break-words text-sm font-semibold leading-5 text-slate-950">{card.title}</h3>
          {card.priority ? <PriorityPill value={card.priority} /> : null}
        </div>

        {card.summary ? <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{card.summary}</p> : null}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {card.dueDate ? (
            <span className="inline-flex h-7 items-center gap-1 rounded-md bg-slate-100 px-2 text-xs text-slate-600">
              <Clock className="h-3.5 w-3.5" />
              {formatShortDate(card.dueDate)}
            </span>
          ) : null}
          <span className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs font-medium ${statusClass}`}>
            <StatusIcon className="h-3.5 w-3.5" />
            {card.delayed ? "已延期" : "未延期"}
          </span>
          {card.comments?.length ? (
            <span className="inline-flex h-7 items-center gap-1 rounded-md bg-slate-100 px-2 text-xs text-slate-600">
              <MessageSquare className="h-3.5 w-3.5" />
              {card.comments.length}
            </span>
          ) : null}
        </div>

        {card.members?.length ? (
          <div className="mt-2 flex items-start gap-2 rounded-md bg-slate-50 px-2 py-2">
            <Users className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
            <div className="flex min-w-0 flex-wrap gap-1">
              {card.members.slice(0, 3).map((member) => (
                <span key={member.id} className="truncate rounded-md bg-white px-1.5 py-0.5 text-xs text-slate-700 shadow-sm">
                  {member.name}
                </span>
              ))}
              {card.members.length > 3 ? (
                <span className="rounded-md bg-white px-1.5 py-0.5 text-xs text-slate-500 shadow-sm">
                  +{card.members.length - 3}
                </span>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="mt-2 flex h-8 items-center gap-2 rounded-md bg-slate-50 px-2 text-xs text-slate-400">
            <Users className="h-3.5 w-3.5" />
            未指定执行人
          </div>
        )}
      </div>
    </article>
  );
}

function AddCardForm({
  listId,
  onCreate
}: {
  listId: number;
  onCreate: (listId: number, title: string) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [open, setOpen] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) {
      return;
    }

    await onCreate(listId, title);
    setTitle("");
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="m-2 inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm font-medium text-slate-700 hover:bg-white"
      >
        <Plus className="h-4 w-4" />
        添加卡片
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="m-2 space-y-2">
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="输入卡片标题"
        className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-teal-700"
      />
      <div className="flex items-center gap-2">
        <button type="submit" className="rounded-md bg-teal-700 px-3 py-2 text-sm font-semibold text-white">
          添加
        </button>
        <button type="button" onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded-md">
          <X className="h-4 w-4" />
        </button>
      </div>
    </form>
  );
}

function CreateListColumn({ onCreate }: { onCreate: (name: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      return;
    }
    await onCreate(name);
    setName("");
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-12 w-80 shrink-0 items-center gap-2 rounded-md bg-white/80 px-4 text-sm font-semibold text-slate-700 hover:bg-white"
      >
        <Plus className="h-4 w-4" />
        添加列表
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="h-fit w-80 shrink-0 rounded-md bg-white p-3 shadow-sm">
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="列表名称"
        className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-teal-700"
      />
      <div className="mt-3 flex items-center gap-2">
        <button type="submit" className="rounded-md bg-teal-700 px-3 py-2 text-sm font-semibold text-white">
          添加列表
        </button>
        <button type="button" onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded-md">
          <X className="h-4 w-4" />
        </button>
      </div>
    </form>
  );
}

function CardModal({
  board,
  card,
  token,
  onClose,
  onUpdated
}: {
  board: Board;
  card: Card;
  token: string;
  onClose: () => void;
  onUpdated: (board: Board) => void;
}) {
  const list = board.lists?.find((item) => item.id === card.listId);
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description);
  const [dueDate, setDueDate] = useState(toDateInput(card.dueDate));
  const [priority, setPriority] = useState(normalizePriority(card.priority ?? ""));
  const [summary, setSummary] = useState(card.summary ?? "");
  const [startDate, setStartDate] = useState(toDateInput(card.startDate));
  const [completedAt, setCompletedAt] = useState(toDateInput(card.completedAt));
  const [progress, setProgress] = useState(card.progress || list?.name || "");
  const [latestProgressRecord, setLatestProgressRecord] = useState(card.latestProgressRecord ?? "");
  const [hiddenOpen, setHiddenOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const skipTitleSaveRef = useRef(false);
  const progressOptions = useMemo(() => board.lists?.map((item) => item.name) ?? [], [board.lists]);
  const memberMatches = useMemo(() => {
    const term = memberSearch.trim().toLowerCase();
    return (board.members ?? []).filter((member) => {
      const alreadyAssigned = (card.members ?? []).some((item) => item.id === member.userId);
      if (alreadyAssigned) {
        return false;
      }
      return (
        term === "" ||
        member.user.name.toLowerCase().includes(term) ||
        member.user.email.toLowerCase().includes(term)
      );
    });
  }, [board.members, card.members, memberSearch]);

  useEffect(() => {
    setTitle(card.title);
    setDescription(card.description);
    setDueDate(toDateInput(card.dueDate));
    setPriority(normalizePriority(card.priority ?? ""));
    setSummary(card.summary ?? "");
    setStartDate(toDateInput(card.startDate));
    setCompletedAt(toDateInput(card.completedAt));
    setProgress(card.progress || list?.name || "");
    setLatestProgressRecord(card.latestProgressRecord ?? "");
    setSaveError("");
  }, [
    card.id,
    card.title,
    card.description,
    card.dueDate,
    card.priority,
    card.summary,
    card.startDate,
    card.completedAt,
    card.progress,
    card.latestProgressRecord,
    list?.name
  ]);

  useEffect(() => {
    setSaveMessage("");
  }, [card.id]);

  useEffect(() => {
    if (!saveMessage) {
      return;
    }

    const timer = window.setTimeout(() => setSaveMessage(""), 3000);
    return () => window.clearTimeout(timer);
  }, [saveMessage]);

  function markEditing() {
    setSaveError("");
    setSaveMessage("");
  }

  async function request(path: string, body: unknown, method: "POST" | "PATCH" | "DELETE" = "PATCH") {
    const updated = await apiRequest<Board>(path, token, {
      method,
      body: method === "DELETE" ? undefined : JSON.stringify(body ?? {})
    });
    onUpdated(updated);
  }

  async function saveDetails() {
    const nextTitle = title.trim();
    if (!nextTitle) {
      setSaveError("卡片标题不能为空");
      setTitle(card.title);
      return;
    }

    setSaving(true);
    setSaveError("");
    setSaveMessage("");
    try {
      await request(`/cards/${card.id}`, {
        title: nextTitle,
        description,
        dueDate,
        priority,
        summary,
        startDate,
        completedAt,
        progress,
        latestProgressRecord
      });
      setTitle(nextTitle);
      setSaveMessage("已保存");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "无法保存卡片");
      setSaveMessage("");
    } finally {
      setSaving(false);
    }
  }

  async function saveTitle() {
    if (skipTitleSaveRef.current) {
      skipTitleSaveRef.current = false;
      setSaveError("");
      setSaveMessage("");
      return;
    }

    const nextTitle = title.trim();
    if (!nextTitle) {
      setSaveError("卡片标题不能为空");
      setSaveMessage("");
      setTitle(card.title);
      return;
    }
    if (nextTitle === card.title) {
      setTitle(nextTitle);
      setSaveError("");
      setSaveMessage("");
      return;
    }

    setSaving(true);
    setSaveError("");
    setSaveMessage("");
    try {
      await request(`/cards/${card.id}`, { title: nextTitle });
      setTitle(nextTitle);
      setSaveMessage("标题已保存");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "无法保存卡片标题");
      setSaveMessage("");
      setTitle(card.title);
    } finally {
      setSaving(false);
    }
  }

  async function addComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!comment.trim()) {
      return;
    }
    await request(`/cards/${card.id}/comments`, { body: comment }, "POST");
    setComment("");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/55 px-4 py-8">
      <section className="w-full max-w-4xl rounded-md bg-white shadow-panel">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2 text-sm text-slate-500">
              <GripVertical className="h-4 w-4" />
              {list?.name ?? "列表"}
            </div>
            <input
              value={title}
              onChange={(event) => {
                markEditing();
                setTitle(event.target.value);
              }}
              onBlur={() => void saveTitle()}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  skipTitleSaveRef.current = true;
                  setSaveMessage("");
                  setTitle(card.title);
                  event.currentTarget.blur();
                }
              }}
              className="w-full rounded-md border border-transparent px-2 py-1 text-2xl font-semibold text-slate-950 outline-none focus:border-slate-300"
            />
            {saveError ? <p className="mt-1 px-2 text-sm text-red-700">{saveError}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-md text-slate-600 hover:bg-slate-100"
            title="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {card.coverColor ? <div className="h-16" style={{ backgroundColor: card.coverColor }} /> : null}

        <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-6">
            <section>
              <h3 className="mb-3 text-sm font-semibold text-slate-900">任务配置</h3>
              <div className="space-y-4">
                <label className="block">
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700">
                    <FileText className="h-4 w-4 text-teal-700" />
                    任务描述
                  </span>
                  <textarea
                    value={description}
                    onChange={(event) => {
                      markEditing();
                      setDescription(event.target.value);
                    }}
                    placeholder="补充背景、目标、验收标准"
                    rows={4}
                    className="mt-1 min-h-28 w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm leading-6 outline-none focus:border-teal-700"
                  />
                </label>

                <div className="grid gap-3 md:grid-cols-3">
                  <label className="block">
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700">
                      <CalendarClock className="h-4 w-4 text-teal-700" />
                      预计完成时间
                    </span>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(event) => {
                        markEditing();
                        setDueDate(event.target.value);
                      }}
                      className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-teal-700"
                    />
                  </label>

                  <PrioritySelect
                    value={priority}
                    onChange={(value) => {
                      markEditing();
                      setPriority(value);
                    }}
                  />

                  <div>
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700">
                      <Clock className="h-4 w-4 text-teal-700" />
                      是否延期
                    </span>
                    <div
                      className={`mt-1 inline-flex h-10 w-full items-center rounded-md border px-3 text-sm ${
                        card.delayed ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      {card.delayed ? "已延期" : "未延期"}
                    </div>
                  </div>
                </div>

                <label className="block">
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700">
                    <Target className="h-4 w-4 text-teal-700" />
                    任务情况总结
                  </span>
                  <textarea
                    value={summary}
                    onChange={(event) => {
                      markEditing();
                      setSummary(event.target.value);
                    }}
                    placeholder="简要记录当前结论、风险或下一步"
                    rows={3}
                    className="mt-1 min-h-24 w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm leading-6 outline-none focus:border-teal-700"
                  />
                </label>
              </div>

              <section className="mt-5 rounded-md border border-slate-200">
                <button
                  type="button"
                  onClick={() => setHiddenOpen((value) => !value)}
                  className="flex h-11 w-full items-center justify-between px-3 text-left text-sm font-semibold text-slate-900 hover:bg-slate-50"
                >
                  <span className="inline-flex items-center gap-2">
                    <ListChecks className="h-4 w-4 text-slate-500" />
                    隐藏字段
                  </span>
                  <ChevronRight className={`h-4 w-4 text-slate-500 transition ${hiddenOpen ? "rotate-90" : ""}`} />
                </button>
                {hiddenOpen ? (
                  <div className="space-y-4 border-t border-slate-200 p-3">
                    <div className="grid gap-3 md:grid-cols-3">
                      <label className="block">
                        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700">
                          <CalendarClock className="h-4 w-4 text-slate-500" />
                          开始时间
                        </span>
                        <input
                          type="date"
                          value={startDate}
                          onChange={(event) => {
                            markEditing();
                            setStartDate(event.target.value);
                          }}
                          className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-teal-700"
                        />
                      </label>
                      <label className="block">
                        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700">
                          <CalendarCheck className="h-4 w-4 text-slate-500" />
                          实际完成日期
                        </span>
                        <input
                          type="date"
                          value={completedAt}
                          onChange={(event) => {
                            markEditing();
                            setCompletedAt(event.target.value);
                          }}
                          className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-teal-700"
                        />
                      </label>
                      <label className="block">
                        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700">
                          <ListChecks className="h-4 w-4 text-slate-500" />
                          进展
                        </span>
                        <select
                          value={progress}
                          onChange={(event) => {
                            markEditing();
                            setProgress(event.target.value);
                          }}
                          className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-teal-700"
                        >
                          {progressOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label className="block">
                      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700">
                        <MessageSquare className="h-4 w-4 text-slate-500" />
                        最新进展记录
                      </span>
                      <textarea
                        value={latestProgressRecord}
                        onChange={(event) => {
                          markEditing();
                          setLatestProgressRecord(event.target.value);
                        }}
                        rows={3}
                        className="mt-1 min-h-24 w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm leading-6 outline-none focus:border-teal-700"
                      />
                    </label>
                  </div>
                ) : null}
              </section>

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void saveDetails()}
                  disabled={saving}
                  className="inline-flex h-10 items-center gap-2 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                  保存
                </button>
                {saveMessage ? (
                  <span
                    role="status"
                    aria-live="polite"
                    className="inline-flex h-10 items-center gap-1.5 rounded-md bg-emerald-50 px-3 text-sm font-medium text-emerald-700"
                  >
                    <CircleCheck className="h-4 w-4" />
                    {saveMessage}
                  </span>
                ) : null}
              </div>
            </section>
          </div>

          <aside className="space-y-5">
            <section>
              <h3 className="mb-2 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                <Users className="h-4 w-4 text-teal-700" />
                任务执行人
              </h3>
              <div className="space-y-3">
                <div className="relative">
                  <label className="relative block">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      value={memberSearch}
                      onChange={(event) => setMemberSearch(event.target.value)}
                      placeholder="搜索并添加成员"
                      className="h-10 w-full rounded-md border border-slate-300 pl-9 pr-3 text-sm outline-none focus:border-teal-700"
                    />
                  </label>
                  {memberSearch.trim() ? (
                    <div className="absolute left-0 right-0 top-11 z-30 max-h-44 space-y-1 overflow-y-auto rounded-md border border-slate-200 bg-white p-1 shadow-panel">
                      {memberMatches.slice(0, 6).map((member) => (
                        <button
                          key={member.userId}
                          type="button"
                          onClick={() => {
                            void request(`/cards/${card.id}/members/${member.userId}`, null, "POST");
                            setMemberSearch("");
                          }}
                          className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                        >
                          <Avatar user={member.user} size="sm" />
                          <span className="min-w-0 flex-1 truncate">{member.user.name}</span>
                        </button>
                      ))}
                      {memberMatches.length === 0 ? (
                        <p className="px-2 py-2 text-sm text-slate-500">没有可添加成员</p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {(card.members ?? []).map((member) => (
                    <span
                      key={member.id}
                      className="inline-flex h-8 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 text-sm text-slate-700"
                    >
                      <Avatar user={member} size="sm" />
                      {member.name}
                      <button
                        type="button"
                        onClick={() => void request(`/cards/${card.id}/members/${member.id}`, null, "DELETE")}
                        className="-mr-1 grid h-6 w-6 place-items-center rounded-md text-slate-500 hover:bg-red-50 hover:text-red-700"
                        title="移除执行人"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                  {(card.members ?? []).length === 0 ? <p className="text-sm text-slate-500">未指定执行人</p> : null}
                </div>
              </div>
            </section>

            <section>
              <h3 className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                <MessageSquare className="h-4 w-4 text-teal-700" />
                评论
              </h3>
              <form onSubmit={addComment} className="space-y-2">
                <textarea
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder="写一条评论"
                  rows={3}
                  className="min-h-24 w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm leading-6 outline-none focus:border-teal-700"
                />
                <button type="submit" className="h-9 rounded-md bg-slate-900 px-3 text-sm font-medium text-white">
                  发送
                </button>
              </form>
              <div className="beacon-scrollbar mt-4 max-h-80 space-y-3 overflow-y-auto pr-1">
                {(card.comments ?? []).map((item) => (
                  <div key={item.id} className="flex gap-3">
                    <Avatar user={item.user} size="sm" />
                    <div className="min-w-0 flex-1 rounded-md bg-slate-50 px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900">{item.user.name}</span>
                        <span className="text-xs text-slate-500">{formatShortDate(item.createdAt)}</span>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{item.body}</p>
                    </div>
                  </div>
                ))}
                {(card.comments ?? []).length === 0 ? (
                  <p className="rounded-md bg-slate-50 px-3 py-3 text-sm text-slate-500">暂无评论</p>
                ) : null}
              </div>
            </section>

            <button
              type="button"
              onClick={() => {
                const confirmed = window.confirm(`确定删除卡片「${card.title}」吗？`);
                if (!confirmed) {
                  return;
                }
                void request(`/cards/${card.id}/permanent`, null, "DELETE");
                onClose();
              }}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-red-200 text-sm font-semibold text-red-700 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" />
              删除卡片
            </button>
          </aside>
        </div>
      </section>
    </div>
  );
}

function PrioritySelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const current = priorityStyle(value);

  return (
    <label className="block">
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700">
        <Target className="h-4 w-4 text-teal-700" />
        优先级
      </span>
      <div className={`mt-1 rounded-md border px-2 py-1 ${current.className}`}>
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-8 w-full bg-transparent text-sm font-medium outline-none"
        >
          {PRIORITY_OPTIONS.map((option) => (
            <option key={option.value || "empty"} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </label>
  );
}

function PriorityPill({ value }: { value: string }) {
  const style = priorityStyle(value);
  return <span className={`rounded-md border px-1.5 py-0.5 font-medium ${style.className}`}>{style.label}</span>;
}

function priorityStyle(value: string) {
  const normalizedValue = normalizePriority(value);
  return PRIORITY_OPTIONS.find((option) => option.value === normalizedValue) ?? {
    value,
    label: value,
    className: "border-slate-200 bg-slate-50 text-slate-700"
  };
}

function normalizePriority(value: string) {
  return LEGACY_PRIORITY_MAP[value] ?? value;
}

function InviteMember({
  token,
  board,
  onUpdated
}: {
  token: string;
  board: Board;
  onUpdated: (board: Board) => void;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim()) {
      return;
    }

    try {
      await apiRequest<WorkspaceMember>(`/workspaces/${board.workspaceId}/members`, token, {
        method: "POST",
        body: JSON.stringify({ email, role: "member" })
      });
      const updated = await apiRequest<Board>(`/boards/${board.id}`, token);
      onUpdated(updated);
      setEmail("");
      setMessage("已加入工作区");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "无法添加成员");
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-10 items-center gap-2 rounded-md bg-white/15 px-3 text-sm font-medium hover:bg-white/25"
      >
        <UserPlus className="h-4 w-4" />
        成员
      </button>
      {open ? (
        <form
          onSubmit={submit}
          className="absolute right-0 top-12 z-20 w-72 rounded-md border border-slate-200 bg-white p-3 text-slate-900 shadow-panel"
        >
          <label className="text-sm font-medium">按邮箱添加已注册成员</label>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-2 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-teal-700"
            placeholder="name@example.com"
          />
          <button type="submit" className="mt-3 h-9 w-full rounded-md bg-teal-700 text-sm font-semibold text-white">
            添加到工作区
          </button>
          {message ? <p className="mt-2 text-sm text-slate-600">{message}</p> : null}
        </form>
      ) : null}
    </div>
  );
}

function MemberStrip({ members }: { members: WorkspaceMember[] }) {
  return (
    <div className="flex items-center gap-2 rounded-md bg-white/15 px-3 py-2 text-white">
      <Users className="h-4 w-4" />
      <div className="flex -space-x-1">
        {members.slice(0, 5).map((member) => (
          <Avatar key={member.userId} user={member.user} size="sm" />
        ))}
      </div>
      <span className="text-sm">{members.length}</span>
    </div>
  );
}

function Avatar({ user, size }: { user: User; size: "sm" | "md" }) {
  const dimension = size === "sm" ? "h-7 w-7 text-xs" : "h-9 w-9 text-sm";
  const initials = user.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full border-2 border-white bg-slate-900 font-semibold text-white ${dimension}`}
      title={user.name}
    >
      {initials || user.email[0]?.toUpperCase()}
    </span>
  );
}

function moveCardLocally(board: Board, cardId: number, targetListId: number, beforeCardId?: number): Board | null {
  const lists = (board.lists ?? []).map((list) => ({
    ...list,
    cards: [...(list.cards ?? [])]
  }));
  let moved: Card | undefined;

  for (const list of lists) {
    const index = list.cards.findIndex((card) => card.id === cardId);
    if (index >= 0) {
      const [card] = list.cards.splice(index, 1);
      moved = { ...card, listId: targetListId };
      break;
    }
  }

  if (!moved) {
    return null;
  }

  const target = lists.find((list) => list.id === targetListId);
  if (!target) {
    return null;
  }

  const beforeIndex = beforeCardId ? target.cards.findIndex((card) => card.id === beforeCardId) : -1;
  const insertIndex = beforeIndex >= 0 ? beforeIndex : target.cards.length;
  target.cards.splice(insertIndex, 0, moved);

  const normalized = lists.map((list) => ({
    ...list,
    cards: list.cards.map((card, position) => ({ ...card, listId: list.id, position }))
  }));

  return { ...board, lists: normalized };
}

function moveListLocally(board: Board, listId: number, beforeListId?: number): Board | null {
  const lists = [...(board.lists ?? [])];
  const fromIndex = lists.findIndex((list) => list.id === listId);
  if (fromIndex < 0 || listId === beforeListId) {
    return null;
  }

  const [moved] = lists.splice(fromIndex, 1);
  const beforeIndex = beforeListId ? lists.findIndex((list) => list.id === beforeListId) : -1;
  const insertIndex = beforeIndex >= 0 ? beforeIndex : lists.length;
  lists.splice(insertIndex, 0, moved);

  return {
    ...board,
    lists: lists.map((list, position) => ({ ...list, position }))
  };
}

function allCards(board: Board): Card[] {
  return (board.lists ?? []).flatMap((list) => list.cards ?? []);
}

function hasDragType(event: DragEvent, type: string) {
  return Array.from(event.dataTransfer.types).includes(type);
}

function setListDragImage(event: DragEvent, source: HTMLElement | null, listName: string, cardCount: number) {
  if (!source || typeof document === "undefined") {
    return;
  }

  const rect = source.getBoundingClientRect();
  const preview = document.createElement("div");
  preview.className =
    "pointer-events-none fixed left-0 top-0 z-[9999] w-80 rounded-md border border-teal-300 bg-white px-4 py-3 text-slate-900 shadow-2xl";
  preview.style.width = `${Math.min(rect.width, 320)}px`;
  preview.style.transform = "translate(-9999px, -9999px)";
  preview.innerHTML = `<div style="font-size:14px;font-weight:700;line-height:20px;">${escapeHtml(listName)}</div><div style="margin-top:4px;font-size:12px;color:#64748b;">正在移动，${cardCount} 张卡片</div>`;
  document.body.appendChild(preview);
  event.dataTransfer.setDragImage(preview, Math.min(rect.width / 2, 160), 24);
  window.setTimeout(() => preview.remove(), 0);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };
    return entities[char] ?? char;
  });
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(new Date(value));
}

function toDateInput(value?: string | null) {
  return value ? value.slice(0, 10) : "";
}
