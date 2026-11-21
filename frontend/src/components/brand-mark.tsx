import { Library } from "lucide-react";
import { cn } from "@/lib/utils";

export function BrandMark({ inverted = false }: { inverted?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={cn(
          "flex size-9 items-center justify-center rounded-xl shadow-sm",
          inverted
            ? "bg-white/15 text-white ring-1 ring-white/25"
            : "bg-primary text-primary-foreground",
        )}
      >
        <Library className="size-5" />
      </span>
      <span
        className={cn(
          "text-[15px] font-semibold tracking-tight",
          inverted ? "text-white" : "text-foreground",
        )}
      >
        DocMind Cloud
      </span>
    </div>
  );
}
