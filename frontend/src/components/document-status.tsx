import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { DocumentStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUS_CLASS: Record<DocumentStatus, string> = {
  UPLOADED: "border-slate-200 bg-slate-100 text-slate-600",
  PROCESSING: "border-amber-200 bg-amber-50 text-amber-700",
  READY: "border-emerald-200 bg-emerald-50 text-emerald-700",
  FAILED: "border-red-200 bg-red-50 text-red-700",
};

const STATUS_LABEL: Record<DocumentStatus, string> = {
  UPLOADED: "Đã tải lên",
  PROCESSING: "Đang xử lý",
  READY: "Sẵn sàng",
  FAILED: "Lỗi",
};

export function DocumentStatusBadge({
  status,
  errorMessage,
}: {
  status: DocumentStatus;
  errorMessage?: string | null;
}) {
  const badge = (
    <Badge className={cn("border", STATUS_CLASS[status])}>
      {status === "PROCESSING" ? <Loader2 className="animate-spin" /> : null}
      {STATUS_LABEL[status]}
    </Badge>
  );

  if (status !== "FAILED" || !errorMessage) return badge;

  return (
    <Tooltip>
      <TooltipTrigger className="cursor-help rounded-4xl" aria-label={errorMessage}>
        {badge}
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-left whitespace-normal">{errorMessage}</TooltipContent>
    </Tooltip>
  );
}
