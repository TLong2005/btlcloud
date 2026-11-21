"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, History, Loader2, Plus, SendHorizontal, X } from "lucide-react";
import { toast } from "sonner";
import { ChatHistory } from "@/components/chat-history";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ApiError, api } from "@/lib/api";
import { getToken } from "@/lib/auth";
import type { AskSource, ConversationDetail, ConversationSummary, ConversationTurn } from "@/lib/types";
import { openDocument } from "@/lib/upload";
import { cn } from "@/lib/utils";

const SUGGESTIONS = [
  "Quy trình xin nghỉ phép như thế nào?",
  "Công tác phí được thanh toán thế nào?",
  "Nhân viên mới cần làm gì trong tuần đầu?",
];

function uniqueDocuments(sources: AskSource[]) {
  const seen = new Set<string>();
  const items: AskSource[] = [];
  for (const source of sources) {
    if (!source.documentId || seen.has(source.documentId)) continue;
    seen.add(source.documentId);
    items.push(source);
  }
  return items;
}

function createId() {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    try {
      return cryptoApi.randomUUID();
    } catch {}
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const MODELS = [
  { id: "gpt-6.1-terra", label: "GPT-6.1 Terra" },
  { id: "gpt-6.1-sol", label: "GPT-6.1 Sol" },
  { id: "gpt-6-astra", label: "GPT-6 Astra" },
  { id: "gpt-6-sol", label: "GPT-6 Sol" },
  { id: "gpt-6-luna", label: "GPT-6 Luna" },
  { id: "gpt-5.6-sol", label: "GPT-5.6 Sol" },
  { id: "gpt-4o-mini", label: "GPT-4o mini" },
] as const;

type ChatModelId = (typeof MODELS)[number]["id"];

type ChatTurn = {
  id: string;
  question: string;
  model: string;
  status: "loading" | "streaming" | "success" | "error";
  answer?: string;
  insufficientData?: boolean;
  sources?: AskSource[];
  error?: string;
};

type AskStreamEvent =
  | { type: "conversation"; id: string; title: string }
  | { type: "meta"; insufficientData: boolean; sources: AskSource[] }
  | { type: "delta"; text: string }
  | { type: "done" }
  | { type: "error"; message: string };

function supportedModel(value: string): ChatModelId {
  return MODELS.some((item) => item.id === value) ? (value as ChatModelId) : "gpt-6.1-terra";
}

function modelLabel(id: string) {
  return MODELS.find((item) => item.id === id)?.label ?? id;
}

function toChatTurn(turn: ConversationTurn): ChatTurn {
  return {
    id: turn.id,
    question: turn.question,
    model: turn.model ?? "gpt-6.1-terra",
    status: "success",
    answer: turn.answer,
    insufficientData: turn.insufficientData,
    sources: turn.sources,
  };
}

function writeConversationQuery(id: string | null, mode: "push" | "replace") {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("c", id);
  else url.searchParams.delete("c");
  const next = `${url.pathname}${url.search}`;
  const current = `${window.location.pathname}${window.location.search}`;
  if (next === current) return;
  if (mode === "push") window.history.pushState(null, "", next);
  else window.history.replaceState(null, "", next);
}

function AnswerText({ text }: { text: string }) {
  return (
    <div className="space-y-1">
      {text.split("\n").map((line, index) => {
        const item = line.match(/^\s*[-*]\s+(.*)$/);
        const body = item?.[1] ?? line;
        if (!body.trim()) return <div key={index} className="h-2" />;
        return (
          <p key={index} className={item ? "pl-4" : undefined}>
            {item ? "• " : null}
            {renderInline(body)}
          </p>
        );
      })}
    </div>
  );
}

function renderInline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) => {
    const bold = part.match(/^\*\*([^*]+)\*\*$/);
    if (bold) return <strong key={index}>{bold[1]}</strong>;
    return <span key={index}>{part}</span>;
  });
}

export default function AskPage() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [model, setModel] = useState<ChatModelId>("gpt-6.1-terra");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversationTitle, setConversationTitle] = useState<string | null>(null);
  const [pending, setPending] = useState<ConversationSummary | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyPanelOpen, setHistoryPanelOpen] = useState(true);
  const [historyPanelReady, setHistoryPanelReady] = useState(false);
  const [opening, setOpening] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ConversationSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const loadToken = useRef(0);
  const conversationIdRef = useRef<string | null>(null);
  const busyRef = useRef(false);
  const loading = turns.some((turn) => turn.status === "loading" || turn.status === "streaming");
  const busy = loading || opening;
  conversationIdRef.current = conversationId;
  busyRef.current = busy;

  const conversationsQuery = useQuery({
    queryKey: ["conversations"],
    queryFn: () => api<ConversationSummary[]>("/api/conversations"),
    refetchOnWindowFocus: true,
  });

  const conversations = useMemo(() => {
    const list = conversationsQuery.data ?? [];
    if (!pending) return list;
    const previous = list.find((item) => item.id === pending.id);
    const rest = list.filter((item) => item.id !== pending.id);
    return [{ ...pending, createdAt: previous?.createdAt ?? pending.createdAt }, ...rest];
  }, [conversationsQuery.data, pending]);

  const loadConversation = useCallback(
    async (id: string) => {
      const token = ++loadToken.current;
      setOpening(true);
      try {
        const detail = await api<ConversationDetail>(`/api/conversations/${encodeURIComponent(id)}`);
        if (token !== loadToken.current) return;
        setConversationId(detail.id);
        setConversationTitle(detail.title);
        setTurns(detail.turns.map(toChatTurn));
      } catch (error) {
        if (token !== loadToken.current) return;
        if (error instanceof ApiError && error.statusCode === 401) return;
        if (error instanceof ApiError && error.statusCode === 404) {
          setConversationId(null);
          setConversationTitle(null);
          setTurns([]);
          writeConversationQuery(null, "replace");
          void queryClient.invalidateQueries({ queryKey: ["conversations"] });
        }
        toast.error(error instanceof Error ? error.message : "Không tải được cuộc trò chuyện");
      } finally {
        if (token === loadToken.current) setOpening(false);
      }
    },
    [queryClient],
  );

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("c");
    if (id) void loadConversation(id);
  }, [loadConversation]);

  useEffect(() => {
    function onPop() {
      if (busyRef.current) {
        writeConversationQuery(conversationIdRef.current, "replace");
        return;
      }
      const id = new URLSearchParams(window.location.search).get("c");
      if (!id) {
        loadToken.current += 1;
        setOpening(false);
        setConversationId(null);
        setConversationTitle(null);
        setTurns([]);
        return;
      }
      void loadConversation(id);
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [loadConversation]);

  useEffect(() => {
    if (!pending) return;
    if ((conversationsQuery.data ?? []).some((item) => item.id === pending.id)) {
      setPending(null);
    }
  }, [conversationsQuery.data, pending]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  useEffect(() => {
    if (!historyOpen && !deleteTarget) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (deleteTarget) setDeleteTarget(null);
      else setHistoryOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [historyOpen, deleteTarget]);

  useEffect(() => {
    if (localStorage.getItem("docmind.history.open") === "0") setHistoryPanelOpen(false);
    setHistoryPanelReady(true);
  }, []);

  useEffect(() => {
    if (!historyPanelReady) return;
    localStorage.setItem("docmind.history.open", historyPanelOpen ? "1" : "0");
  }, [historyPanelOpen, historyPanelReady]);

  function updateTurn(id: string, patch: Partial<ChatTurn>) {
    setTurns((current) => current.map((turn) => (turn.id === id ? { ...turn, ...patch } : turn)));
  }

  function forgetCreatedConversation(removedId: string) {
    setPending((current) => (current?.id === removedId ? null : current));
    setConversationId((current) => (current === removedId ? null : current));
    setConversationTitle(null);
    if (new URLSearchParams(window.location.search).get("c") === removedId) {
      writeConversationQuery(null, "replace");
    }
  }

  async function requestAnswer(
    id: string,
    question: string,
    selectedModel: string,
    conversationIdArg: string | null,
  ) {
    updateTurn(id, { status: "loading", error: undefined, answer: "" });
    let announcedId: string | null = conversationIdArg;
    let failed = false;
    try {
      const token = getToken();
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          question,
          model: supportedModel(selectedModel),
          ...(conversationIdArg ? { conversationId: conversationIdArg } : {}),
        }),
      });
      if (response.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (!response.ok || !response.body) {
        let message = "Không thể gửi câu hỏi";
        try {
          const payload = (await response.json()) as { message?: string | string[] };
          if (typeof payload.message === "string") message = payload.message;
          else if (Array.isArray(payload.message)) message = payload.message.join(", ");
        } catch {
          message = "Không thể gửi câu hỏi";
        }
        throw new ApiError(response.status, message);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";
        for (const chunk of chunks) {
          const line = chunk.split("\n").find((item) => item.startsWith("data:"));
          if (!line) continue;
          const event = JSON.parse(line.slice(5).trim()) as AskStreamEvent;
          if (event.type === "conversation") {
            announcedId = event.id;
            setConversationId(event.id);
            setConversationTitle(event.title);
            writeConversationQuery(event.id, "replace");
            if (!conversationIdArg) {
              const now = new Date().toISOString();
              setPending({
                id: event.id,
                title: event.title,
                createdAt: now,
                updatedAt: now,
              });
            }
          } else if (event.type === "meta") {
            updateTurn(id, {
              insufficientData: event.insufficientData,
              sources: event.sources,
            });
          } else if (event.type === "delta") {
            setTurns((current) =>
              current.map((turn) =>
                turn.id === id
                  ? {
                      ...turn,
                      status: "streaming",
                      answer: `${turn.answer ?? ""}${event.text}`,
                    }
                  : turn,
              ),
            );
          } else if (event.type === "done") {
            finished = true;
            updateTurn(id, { status: "success" });
          } else if (event.type === "error") {
            failed = true;
            updateTurn(id, { status: "error", error: event.message });
            if (!conversationIdArg && announcedId) forgetCreatedConversation(announcedId);
          }
        }
      }
      if (failed) {
        void queryClient.invalidateQueries({ queryKey: ["conversations"] });
        return;
      }
      if (!finished) {
        updateTurn(id, { status: "error", error: "Kết nối bị gián đoạn" });
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 401) return;
      updateTurn(id, {
        status: "error",
        error: error instanceof Error ? error.message : "Không thể gửi câu hỏi",
      });
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
    }
  }

  function send(rawQuestion: string) {
    const question = rawQuestion.trim();
    if (!question || busy) return;
    const id = createId();
    const selectedModel = model;
    const currentConversationId = conversationId;
    setTurns((current) => [...current, { id, question, model: selectedModel, status: "loading" }]);
    setDraft("");
    void requestAnswer(id, question, selectedModel, currentConversationId);
  }

  function startNew() {
    if (busy) return;
    loadToken.current += 1;
    setOpening(false);
    setConversationId(null);
    setConversationTitle(null);
    setTurns([]);
    setDraft("");
    setHistoryOpen(false);
    writeConversationQuery(null, "push");
  }

  function openFromList(id: string) {
    setHistoryOpen(false);
    if (busy || id === conversationId) return;
    const known = conversations.find((item) => item.id === id);
    writeConversationQuery(id, "push");
    setConversationId(id);
    setConversationTitle(known?.title ?? null);
    setTurns([]);
    void loadConversation(id);
  }

  async function confirmDelete() {
    if (!deleteTarget || deleting) return;
    const target = deleteTarget;
    setDeleting(true);
    try {
      await api(`/api/conversations/${encodeURIComponent(target.id)}`, { method: "DELETE" });
      queryClient.setQueryData<ConversationSummary[]>(["conversations"], (current) =>
        (current ?? []).filter((item) => item.id !== target.id),
      );
      setPending((current) => (current?.id === target.id ? null : current));
      if (conversationId === target.id) {
        loadToken.current += 1;
        setOpening(false);
        setConversationId(null);
        setConversationTitle(null);
        setTurns([]);
        writeConversationQuery(null, "replace");
      }
      setDeleteTarget(null);
      toast.success("Đã xóa cuộc trò chuyện");
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 401) return;
      toast.error(error instanceof Error ? error.message : "Không xóa được cuộc trò chuyện");
    } finally {
      setDeleting(false);
    }
  }

  const headerTitle = conversationTitle ?? turns[0]?.question ?? "Cuộc trò chuyện mới";
  const showHeader = Boolean(conversationId || turns.length > 0);
  const historyError =
    conversationsQuery.error instanceof Error ? conversationsQuery.error.message : null;

  return (
    <div className="flex h-full min-h-0 flex-1 overflow-hidden">
      <aside
        className={cn(
          "hidden h-full min-h-0 min-w-0 shrink-0 overflow-hidden transition-[width,margin] duration-200 ease-out motion-reduce:transition-none md:flex",
          historyPanelOpen ? "mr-4 w-72" : "mr-0 w-0",
        )}
        aria-hidden={!historyPanelOpen}
        inert={!historyPanelOpen}
      >
        <div className="flex h-full w-72 min-w-72 flex-col overflow-hidden rounded-2xl border border-border bg-white">
          <ChatHistory
            conversations={conversations}
            activeId={conversationId}
            loading={conversationsQuery.isLoading}
            error={historyError}
            disabled={busy}
            onNew={startNew}
            onOpen={openFromList}
            onDelete={setDeleteTarget}
            onRetry={() => void conversationsQuery.refetch()}
            onClose={() => setHistoryPanelOpen(false)}
          />
        </div>
      </aside>

      {historyOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Đóng lịch sử"
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setHistoryOpen(false)}
          />
          <div className="relative flex h-full w-80 max-w-[85vw] flex-col bg-white shadow-xl">
            <ChatHistory
              conversations={conversations}
              activeId={conversationId}
              loading={conversationsQuery.isLoading}
              error={historyError}
              disabled={busy}
              onNew={startNew}
              onOpen={openFromList}
              onDelete={setDeleteTarget}
              onRetry={() => void conversationsQuery.refetch()}
              onClose={() => setHistoryOpen(false)}
            />
          </div>
        </div>
      ) : null}

      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div
          className={cn(
            "mb-3 flex shrink-0 items-center gap-2",
            !showHeader && historyPanelOpen && "md:hidden",
          )}
        >
          <Button
            type="button"
            variant="outline"
            className="md:hidden"
            onClick={() => setHistoryOpen(true)}
          >
            <History />
            Lịch sử
          </Button>
          {!historyPanelOpen ? (
            <Button
              type="button"
              variant="outline"
              className="hidden md:inline-flex"
              aria-expanded={false}
              onClick={() => setHistoryPanelOpen(true)}
            >
              <History />
              Lịch sử
            </Button>
          ) : null}
          {showHeader ? <p className="min-w-0 flex-1 truncate text-sm font-medium">{headerTitle}</p> : <span className="flex-1" />}
          <Button
            type="button"
            variant="outline"
            className={cn(historyPanelOpen && "md:hidden")}
            disabled={busy}
            onClick={startNew}
          >
            <Plus />
            Mới
          </Button>
        </div>

        <ScrollArea className="h-0 min-h-0 w-full flex-1 overflow-hidden">
          <div className="flex min-h-full flex-col gap-6 px-1 pt-1 pb-8">
            {opening ? (
              <div className="flex flex-1 items-center justify-center px-2 py-16 text-sm text-muted-foreground">
                <Loader2 className="mr-2 size-4 animate-spin text-primary" />
                Đang tải cuộc trò chuyện...
              </div>
            ) : turns.length === 0 && conversationId ? (
              <div className="flex flex-1 items-center justify-center px-2 py-16 text-sm text-muted-foreground">
                Chưa có nội dung trong cuộc trò chuyện này.
              </div>
            ) : turns.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center px-2 py-16 text-center">
                <h1 className="text-2xl font-semibold tracking-tight">Hỏi đáp</h1>
                <p className="mt-2 max-w-md text-sm text-muted-foreground">
                  Đặt câu hỏi bằng tiếng Việt. Câu trả lời kèm tên tệp nguồn và được lưu trong lịch sử.
                </p>
                <div className="mt-6 flex max-w-xl flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      disabled={busy}
                      className="rounded-full border border-border bg-white px-3 py-2 text-left text-sm text-foreground transition-colors hover:border-primary/40 hover:bg-accent disabled:opacity-50"
                      onClick={() => send(suggestion)}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              turns.map((turn) => (
                <article key={turn.id} className="space-y-3">
                  <div className="flex justify-end">
                    <div className="max-w-[85%]">
                      <p className="mb-1 text-right text-[11px] text-muted-foreground">{modelLabel(turn.model)}</p>
                      <p className="rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm leading-relaxed text-primary-foreground">
                        {turn.question}
                      </p>
                    </div>
                  </div>
                  <Card className="max-w-[92%]">
                    <CardContent>
                      {turn.status === "loading" ? (
                        <p className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="size-4 animate-spin text-primary" />
                          Đang tìm trong tài liệu...
                        </p>
                      ) : null}
                      {(turn.status === "streaming" || turn.status === "success") && !turn.insufficientData ? (
                        <div className="text-sm leading-relaxed">
                          <AnswerText text={turn.answer ?? ""} />
                          {turn.status === "streaming" ? (
                            <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-primary align-middle" />
                          ) : null}
                        </div>
                      ) : null}
                      {turn.status === "error" ? (
                        <div className="space-y-3">
                          <p className="text-sm text-red-600">{turn.error}</p>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void requestAnswer(turn.id, turn.question, turn.model, conversationId)}
                          >
                            Thử lại
                          </Button>
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                  {turn.insufficientData && (turn.status === "streaming" || turn.status === "success") ? (
                    <div className="max-w-[92%] rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                      Chưa đủ dữ liệu trong tài liệu để trả lời câu hỏi này.
                    </div>
                  ) : null}
                  {(turn.status === "streaming" || turn.status === "success") &&
                  !turn.insufficientData &&
                  uniqueDocuments(turn.sources ?? []).length > 0 ? (
                    <div className="flex max-w-[92%] flex-wrap gap-x-4 gap-y-1">
                      {uniqueDocuments(turn.sources ?? []).map((source) => (
                        <button
                          key={source.documentId}
                          type="button"
                          className="inline-flex min-w-0 items-center gap-1.5 text-sm font-medium text-primary underline-offset-2 hover:underline"
                          onClick={() => {
                            void openDocument(source.documentId, source.filename).catch((error: unknown) => {
                              toast.error(error instanceof Error ? error.message : "Không thể mở tệp");
                            });
                          }}
                        >
                          <FileText className="size-3.5 shrink-0" />
                          <span className="truncate">{source.filename}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))
            )}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>

        <form
          className="relative z-10 shrink-0 border-t border-border bg-background pt-4"
          onSubmit={(event) => {
            event.preventDefault();
            send(draft);
          }}
        >
          <label className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
            Mô hình
            <select
              value={model}
              disabled={busy}
              className="h-9 rounded-lg border border-input bg-white px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
              onChange={(event) => setModel(event.target.value as ChatModelId)}
            >
              {MODELS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              rows={2}
              disabled={busy}
              placeholder="Đặt câu hỏi về tài liệu nội bộ..."
              className="max-h-40 min-h-11 flex-1 resize-none rounded-xl border border-input bg-white px-3 py-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  send(draft);
                }
              }}
            />
            <Button
              type="button"
              className="h-11 px-4"
              disabled={busy || !draft.trim()}
              onClick={() => send(draft)}
            >
              <SendHorizontal />
              Gửi
            </Button>
          </div>
        </form>
      </div>

      {deleteTarget ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="presentation"
          onClick={() => {
            if (!deleting) setDeleteTarget(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Xóa cuộc trò chuyện"
            className="w-full max-w-md rounded-xl bg-card p-5 text-card-foreground shadow-lg ring-1 ring-foreground/10"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-base font-semibold">Xóa cuộc trò chuyện</h2>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Đóng"
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
              >
                <X />
              </Button>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              Cuộc trò chuyện này sẽ bị xóa, gồm mọi câu hỏi và câu trả lời.
            </p>
            <p className="mt-2 text-sm font-medium">{deleteTarget.title}</p>
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={deleting} onClick={() => setDeleteTarget(null)}>
                Hủy
              </Button>
              <Button type="button" variant="destructive" disabled={deleting} onClick={() => void confirmDelete()}>
                Xóa
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
