"use client";

import { Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { ConversationSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

function formatConversationTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

function groupConversations(items: ConversationSummary[]) {
  const today: ConversationSummary[] = [];
  const yesterday: ConversationSummary[] = [];
  const earlier: ConversationSummary[] = [];
  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);
  const startYesterday = new Date(startToday);
  startYesterday.setDate(startYesterday.getDate() - 1);
  const todayMs = startToday.getTime();
  const yesterdayMs = startYesterday.getTime();

  for (const item of items) {
    const time = new Date(item.updatedAt).getTime();
    if (Number.isNaN(time) || time >= todayMs) today.push(item);
    else if (time >= yesterdayMs) yesterday.push(item);
    else earlier.push(item);
  }

  return [
    { id: "today", label: "Hôm nay", items: today },
    { id: "yesterday", label: "Hôm qua", items: yesterday },
    { id: "earlier", label: "Trước đó", items: earlier },
  ].filter((group) => group.items.length > 0);
}

export function ChatHistory({
  conversations,
  activeId,
  loading,
  error,
  disabled,
  onNew,
  onOpen,
  onDelete,
  onRetry,
  onClose,
}: {
  conversations: ConversationSummary[];
  activeId: string | null;
  loading: boolean;
  error: string | null;
  disabled: boolean;
  onNew: () => void;
  onOpen: (id: string) => void;
  onDelete: (conversation: ConversationSummary) => void;
  onRetry: () => void;
  onClose?: () => void;
}) {
  const groups = groupConversations(conversations);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 p-3">
        <Button
          type="button"
          variant="outline"
          className="h-9 flex-1 justify-start px-3"
          disabled={disabled}
          onClick={onNew}
        >
          <Plus />
          Cuộc trò chuyện mới
        </Button>
        {onClose ? (
          <Button type="button" variant="ghost" size="icon" aria-label="Đóng lịch sử" onClick={onClose}>
            <X />
          </Button>
        ) : null}
      </div>
      <p className="px-4 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        Lịch sử
      </p>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {loading ? (
          <div className="space-y-2 px-1">
            <Skeleton className="h-12 w-full rounded-xl" />
            <Skeleton className="h-12 w-full rounded-xl" />
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>
        ) : null}
        {!loading && error ? (
          <div className="space-y-2 px-2 py-3">
            <p className="text-sm text-red-600">{error}</p>
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              Tải lại
            </Button>
          </div>
        ) : null}
        {!loading && !error && conversations.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">Chưa có cuộc trò chuyện nào.</p>
        ) : null}
        {!loading && !error
          ? groups.map((group) => (
              <section key={group.id} className="mt-2">
                <p className="px-2 py-1 text-[11px] font-medium text-muted-foreground">{group.label}</p>
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const active = item.id === activeId;
                    return (
                      <div
                        key={item.id}
                        className={cn(
                          "group flex items-start rounded-xl",
                          active ? "bg-accent text-primary" : "hover:bg-muted",
                        )}
                      >
                        <button
                          type="button"
                          disabled={disabled}
                          title={item.title}
                          aria-current={active ? "true" : undefined}
                          className="min-w-0 flex-1 px-2.5 py-2 text-left disabled:opacity-60"
                          onClick={() => onOpen(item.id)}
                        >
                          <span className="line-clamp-2 text-sm leading-snug">{item.title}</span>
                          <span className="mt-0.5 block text-[11px] text-muted-foreground">
                            {formatConversationTime(item.updatedAt)}
                          </span>
                        </button>
                        <button
                          type="button"
                          className="mt-1.5 mr-1.5 shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white hover:text-red-600 disabled:opacity-40"
                          aria-label={`Xóa ${item.title}`}
                          title="Xóa"
                          disabled={disabled}
                          onClick={() => onDelete(item)}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))
          : null}
      </div>
    </div>
  );
}
