"use client";

import { useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, File, FileText, FileType, Pencil, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { DocumentStatusBadge } from "@/components/document-status";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError, api } from "@/lib/api";
import { formatBytes, formatDateTime } from "@/lib/format";
import type { DocumentRecord } from "@/lib/types";
import { downloadDocument, replaceDocument, uploadDocument } from "@/lib/upload";
import { cn } from "@/lib/utils";

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_PARALLEL = 3;
const ALLOWED = new Set(["pdf", "docx", "txt"]);

type UploadPhase = "waiting" | "uploading" | "done" | "failed";

type UploadRow = {
  localId: string;
  filename: string;
  progress: number;
  phase: UploadPhase;
  message: string | null;
};

type QueuedUpload = {
  localId: string;
  file: File;
};

function extensionOf(filename: string) {
  const dot = filename.lastIndexOf(".");
  if (dot < 0) return "";
  return filename.slice(dot + 1).toLowerCase();
}

function FileGlyph({ filename }: { filename: string }) {
  const ext = extensionOf(filename);
  const Icon = ext === "pdf" ? FileText : ext === "docx" ? FileType : File;
  return <Icon className="size-4 shrink-0 text-primary" />;
}

function isPendingStatus(doc: DocumentRecord) {
  return doc.status === "UPLOADED" || doc.status === "PROCESSING";
}

export default function DocumentsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const replaceTarget = useRef<DocumentRecord | null>(null);
  const queueRef = useRef<QueuedUpload[]>([]);
  const activeRef = useRef(0);
  const [dragOver, setDragOver] = useState(false);
  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const [detail, setDetail] = useState<DocumentRecord | null>(null);
  const [renameTarget, setRenameTarget] = useState<DocumentRecord | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DocumentRecord | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const documentsQuery = useQuery({
    queryKey: ["documents"],
    queryFn: () => api<DocumentRecord[]>("/api/documents"),
    refetchInterval: (query) => {
      const docs = query.state.data;
      if (!docs?.some((doc) => doc.status === "UPLOADED" || doc.status === "PROCESSING")) {
        return false;
      }
      return 3000;
    },
  });

  const documents = [...(documentsQuery.data ?? [])].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const readyCount = documents.filter((doc) => doc.status === "READY").length;
  const processingCount = documents.filter(isPendingStatus).length;
  const failedCount = documents.filter((doc) => doc.status === "FAILED").length;
  const isAdmin = user?.role === "ADMIN";
  const visibleDetail = detail
    ? (documents.find((doc) => doc.id === detail.id) ?? detail)
    : null;

  async function runDocumentAction(doc: DocumentRecord, action: () => Promise<void>) {
    setBusyId(doc.id);
    try {
      await action();
      void queryClient.invalidateQueries({ queryKey: ["documents"] });
    } catch (error: unknown) {
      if (error instanceof ApiError && error.statusCode === 401) return;
      toast.error(error instanceof Error ? error.message : "Không thể thực hiện thao tác");
    } finally {
      setBusyId(null);
    }
  }

  function openRename(doc: DocumentRecord) {
    setRenameTarget(doc);
    setRenameValue(doc.filename);
  }

  function startReplace(doc: DocumentRecord) {
    replaceTarget.current = doc;
    if (replaceRef.current) replaceRef.current.value = "";
    replaceRef.current?.click();
  }

  async function openDetail(doc: DocumentRecord) {
    setDetail(doc);
    try {
      const fresh = await api<DocumentRecord>(`/api/documents/${doc.id}`);
      setDetail(fresh);
    } catch (error: unknown) {
      if (error instanceof ApiError && error.statusCode === 401) return;
      toast.error(error instanceof Error ? error.message : "Không tải được tài liệu");
    }
  }

  async function submitRename() {
    if (!renameTarget) return;
    const filename = renameValue.trim();
    if (!filename) {
      toast.error("Vui lòng nhập tên tệp");
      return;
    }
    const target = renameTarget;
    await runDocumentAction(target, async () => {
      await api(`/api/documents/${target.id}`, {
        method: "PATCH",
        body: JSON.stringify({ filename }),
      });
      toast.success("Đã đổi tên tài liệu");
      setRenameTarget(null);
      setDetail((current) => (current?.id === target.id ? { ...current, filename } : current));
    });
  }

  async function submitDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    await runDocumentAction(target, async () => {
      await api(`/api/documents/${target.id}`, { method: "DELETE" });
      toast.success("Đã xóa tài liệu");
      setDeleteTarget(null);
      setDetail((current) => (current?.id === target.id ? null : current));
    });
  }

  async function onReplaceChosen(file: File | undefined) {
    const doc = replaceTarget.current;
    replaceTarget.current = null;
    if (!doc || !file) return;
    const ext = extensionOf(file.name);
    if (!ALLOWED.has(ext)) {
      toast.error(`${file.name}: chỉ nhận tệp PDF, DOCX hoặc TXT`);
      return;
    }
    if (file.size <= 0) {
      toast.error(`${file.name}: tệp trống`);
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error(`${file.name}: vượt quá 10MB`);
      return;
    }
    await runDocumentAction(doc, async () => {
      await replaceDocument(doc.id, file, () => undefined);
      toast.success("Đã thay tệp. Tài liệu đang được xử lý lại.");
    });
  }

  function patchUpload(localId: string, patch: Partial<UploadRow>) {
    setUploads((current) =>
      current.map((row) => (row.localId === localId ? { ...row, ...patch } : row)),
    );
  }

  function pump() {
    while (activeRef.current < MAX_PARALLEL && queueRef.current.length > 0) {
      const next = queueRef.current.shift();
      if (!next) return;
      activeRef.current += 1;
      patchUpload(next.localId, { phase: "uploading", progress: 0 });
      uploadDocument(next.file, (progress) => {
        patchUpload(next.localId, { progress });
      })
        .then(() => {
          patchUpload(next.localId, { phase: "done", progress: 100, message: "Đã tải lên" });
          void queryClient.invalidateQueries({ queryKey: ["documents"] });
        })
        .catch((error: unknown) => {
          if (error instanceof ApiError && error.statusCode === 401) return;
          const message = error instanceof Error ? error.message : "Không thể tải tệp lên";
          patchUpload(next.localId, { phase: "failed", message });
          toast.error(`${next.file.name}: ${message}`);
        })
        .finally(() => {
          activeRef.current -= 1;
          pump();
        });
    }
  }

  function enqueue(fileList: FileList | File[]) {
    const accepted: UploadRow[] = [];
    const queued: QueuedUpload[] = [];

    for (const file of Array.from(fileList)) {
      const ext = extensionOf(file.name);
      if (!ALLOWED.has(ext)) {
        toast.error(`${file.name}: chỉ nhận tệp PDF, DOCX hoặc TXT`);
        continue;
      }
      if (file.size > MAX_BYTES) {
        toast.error(`${file.name}: vượt quá 10MB`);
        continue;
      }
      const localId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      accepted.push({
        localId,
        filename: file.name,
        progress: 0,
        phase: "waiting",
        message: null,
      });
      queued.push({ localId, file });
    }

    if (accepted.length === 0) return;
    setUploads((current) => [...accepted, ...current]);
    queueRef.current.push(...queued);
    pump();
  }

  const stats = [
    { label: "Tổng tài liệu", value: documents.length },
    { label: "Sẵn sàng", value: readyCount },
    { label: "Đang xử lý", value: processingCount },
    { label: "Lỗi", value: failedCount },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tài liệu</h1>
        <p className="mt-1 text-sm text-muted-foreground">{user?.tenantName}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="space-y-2">
              <p className="text-sm text-muted-foreground">{stat.label}</p>
              {documentsQuery.isPending ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <p className="text-2xl font-semibold tabular-nums">{stat.value}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {isAdmin ? (
        <Card
          className={cn(
            "border border-dashed border-border bg-card shadow-none ring-0 transition-colors",
            dragOver && "border-primary bg-accent",
          )}
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            enqueue(event.dataTransfer.files);
          }}
        >
          <CardContent>
            <button
              type="button"
              className="flex w-full flex-col items-center px-4 py-8 text-center"
              onClick={() => inputRef.current?.click()}
            >
              <span className="flex size-11 items-center justify-center rounded-xl bg-accent text-primary">
                <Upload className="size-5" />
              </span>
              <span className="mt-3 text-sm font-medium">Kéo và thả tệp vào đây</span>
              <span className="mt-1 text-sm text-muted-foreground">
                hoặc bấm để chọn. PDF, DOCX, TXT, tối đa 10MB.
              </span>
            </button>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              multiple
              accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
              onChange={(event) => {
                if (event.target.files) enqueue(event.target.files);
                event.target.value = "";
              }}
            />
            {uploads.length > 0 ? (
              <ul className="mt-2 space-y-3 border-t border-border pt-4">
                {uploads.map((row) => (
                  <li key={row.localId} className="space-y-2">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <FileGlyph filename={row.filename} />
                        <span className="truncate font-medium">{row.filename}</span>
                      </span>
                      <span
                        className={cn(
                          "shrink-0 text-xs",
                          row.phase === "failed" ? "text-red-600" : "text-muted-foreground",
                        )}
                      >
                        {row.phase === "waiting"
                          ? "Đang chờ"
                          : row.phase === "uploading"
                            ? `${row.progress}%`
                            : row.phase === "done"
                              ? "Đã tải lên"
                              : row.message}
                      </span>
                    </div>
                    <Progress value={row.phase === "failed" ? 100 : row.progress} />
                  </li>
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <p className="rounded-xl border border-border bg-white px-4 py-3 text-sm text-muted-foreground">
          Chỉ quản trị viên mới tải tài liệu lên.
        </p>
      )}

      {documentsQuery.isPending ? (
        <Card>
          <CardContent className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      ) : documentsQuery.isError ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 py-8">
            <p className="text-sm text-foreground">Không tải được danh sách tài liệu.</p>
            <p className="text-sm text-muted-foreground">
              {documentsQuery.error instanceof Error
                ? documentsQuery.error.message
                : "Đã có lỗi xảy ra"}
            </p>
            <Button variant="outline" onClick={() => void documentsQuery.refetch()}>
              Thử lại
            </Button>
          </CardContent>
        </Card>
      ) : documents.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center px-6 py-14 text-center">
            <FileText className="size-8 text-muted-foreground" />
            <p className="mt-3 font-medium">Chưa có tài liệu</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              {isAdmin
                ? "Kéo thả tệp vào vùng phía trên để bắt đầu."
                : "Tài liệu sẽ xuất hiện khi quản trị viên tải lên."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {documents.map((doc) => (
              <Card key={doc.id} size="sm">
                <CardContent className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      className="flex min-w-0 items-center gap-2 text-left font-medium hover:underline"
                      onClick={() => void openDetail(doc)}
                    >
                      <FileGlyph filename={doc.filename} />
                      <span className="truncate">{doc.filename}</span>
                    </button>
                    <DocumentStatusBadge status={doc.status} errorMessage={doc.errorMessage} />
                  </div>
                  <dl className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div>
                      <dt>Kích thước</dt>
                      <dd className="mt-0.5 text-sm text-foreground">{formatBytes(doc.sizeBytes)}</dd>
                    </div>
                    <div>
                      <dt>Số đoạn</dt>
                      <dd className="mt-0.5 text-sm text-foreground tabular-nums">{doc.chunkCount}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt>Tải lên lúc</dt>
                      <dd className="mt-0.5 text-sm text-foreground">{formatDateTime(doc.createdAt)}</dd>
                    </div>
                  </dl>
                  <DocumentActions
                    doc={doc}
                    isAdmin={isAdmin}
                    busy={busyId === doc.id}
                    onDownload={(item) => void runDocumentAction(item, () => downloadDocument(item.id, item.filename))}
                    onRename={openRename}
                    onReplace={startReplace}
                    onDelete={setDeleteTarget}
                  />
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="hidden md:block">
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tên tệp</TableHead>
                    <TableHead>Kích thước</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead>Số đoạn</TableHead>
                    <TableHead>Tải lên lúc</TableHead>
                    <TableHead className="text-right">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell className="max-w-xs whitespace-normal">
                        <button
                          type="button"
                          className="flex items-center gap-2 text-left hover:underline"
                          onClick={() => void openDetail(doc)}
                        >
                          <FileGlyph filename={doc.filename} />
                          <span className="font-medium">{doc.filename}</span>
                        </button>
                      </TableCell>
                      <TableCell>{formatBytes(doc.sizeBytes)}</TableCell>
                      <TableCell>
                        <DocumentStatusBadge status={doc.status} errorMessage={doc.errorMessage} />
                      </TableCell>
                      <TableCell className="tabular-nums">{doc.chunkCount}</TableCell>
                      <TableCell>{formatDateTime(doc.createdAt)}</TableCell>
                      <TableCell>
                        <DocumentActions
                          doc={doc}
                          isAdmin={isAdmin}
                          busy={busyId === doc.id}
                          onDownload={(item) =>
                            void runDocumentAction(item, () => downloadDocument(item.id, item.filename))
                          }
                          onRename={openRename}
                          onReplace={startReplace}
                          onDelete={setDeleteTarget}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      <input
        ref={replaceRef}
        type="file"
        className="hidden"
        accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          void onReplaceChosen(file);
        }}
      />

      {visibleDetail ? (
        <DialogFrame title="Chi tiết tài liệu" onClose={() => setDetail(null)}>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Tên tệp</dt>
              <dd className="mt-1 font-medium">{visibleDetail.filename}</dd>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <dt className="text-muted-foreground">Kích thước</dt>
                <dd className="mt-1">{formatBytes(visibleDetail.sizeBytes)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Số đoạn</dt>
                <dd className="mt-1 tabular-nums">{visibleDetail.chunkCount}</dd>
              </div>
            </div>
            <div>
              <dt className="text-muted-foreground">Trạng thái</dt>
              <dd className="mt-1">
                <DocumentStatusBadge
                  status={visibleDetail.status}
                  errorMessage={visibleDetail.errorMessage}
                />
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Tải lên lúc</dt>
              <dd className="mt-1">{formatDateTime(visibleDetail.createdAt)}</dd>
            </div>
            {visibleDetail.errorMessage ? (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{visibleDetail.errorMessage}</p>
            ) : null}
          </dl>
          <div className="mt-5">
            <DocumentActions
              doc={visibleDetail}
              isAdmin={isAdmin}
              busy={busyId === visibleDetail.id}
              onDownload={(item) => void runDocumentAction(item, () => downloadDocument(item.id, item.filename))}
              onRename={openRename}
              onReplace={startReplace}
              onDelete={setDeleteTarget}
            />
          </div>
        </DialogFrame>
      ) : null}

      {renameTarget ? (
        <DialogFrame title="Đổi tên tài liệu" onClose={() => setRenameTarget(null)}>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void submitRename();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="document-name">Tên tệp</Label>
              <Input
                id="document-name"
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">Giữ nguyên đuôi tệp hiện tại.</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setRenameTarget(null)}>
                Hủy
              </Button>
              <Button type="submit" disabled={busyId === renameTarget.id}>
                Lưu
              </Button>
            </div>
          </form>
        </DialogFrame>
      ) : null}

      {deleteTarget ? (
        <DialogFrame title="Xóa tài liệu" onClose={() => setDeleteTarget(null)}>
          <p className="text-sm text-muted-foreground">
            Xóa <span className="font-medium text-foreground">{deleteTarget.filename}</span>? Tệp gốc
            và các đoạn đã xử lý sẽ bị xóa khỏi tenant này.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)}>
              Hủy
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busyId === deleteTarget.id}
              onClick={() => void submitDelete()}
            >
              Xóa
            </Button>
          </div>
        </DialogFrame>
      ) : null}
    </div>
  );
}

function DocumentActions({
  doc,
  isAdmin,
  busy,
  onDownload,
  onRename,
  onReplace,
  onDelete,
}: {
  doc: DocumentRecord;
  isAdmin: boolean;
  busy: boolean;
  onDownload: (doc: DocumentRecord) => void;
  onRename: (doc: DocumentRecord) => void;
  onReplace: (doc: DocumentRecord) => void;
  onDelete: (doc: DocumentRecord) => void;
}) {
  return (
    <div className="flex flex-wrap justify-end gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`Tải xuống ${doc.filename}`}
        title="Tải xuống"
        disabled={busy}
        onClick={() => onDownload(doc)}
      >
        <Download />
      </Button>
      {isAdmin ? (
        <>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Đổi tên ${doc.filename}`}
            title="Đổi tên"
            disabled={busy}
            onClick={() => onRename(doc)}
          >
            <Pencil />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Thay tệp ${doc.filename}`}
            title="Thay tệp"
            disabled={busy}
            onClick={() => onReplace(doc)}
          >
            <Upload />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-red-600"
            aria-label={`Xóa ${doc.filename}`}
            title="Xóa"
            disabled={busy}
            onClick={() => onDelete(doc)}
          >
            <Trash2 />
          </Button>
        </>
      ) : null}
    </div>
  );
}

function DialogFrame({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-md rounded-xl bg-card p-5 text-card-foreground shadow-lg ring-1 ring-foreground/10"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Đóng" onClick={onClose}>
            <X />
          </Button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
