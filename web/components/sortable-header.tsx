import Link from "next/link";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface SortableHeaderProps {
  label: string;
  sortKey: string;
  basePath: string;
  currentSort?: string;
  currentOrder?: "asc" | "desc";
  preservedParams?: Record<string, string | undefined>;
}

export function SortableHeader({
  label,
  sortKey,
  basePath,
  currentSort,
  currentOrder,
  preservedParams = {},
}: SortableHeaderProps) {
  const isActive = currentSort === sortKey;
  const nextOrder: "asc" | "desc" = isActive && currentOrder === "desc" ? "asc" : "desc";

  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(preservedParams)) {
    if (v) params.set(k, v);
  }
  params.set("sort", sortKey);
  params.set("order", nextOrder);

  return (
    <Link
      href={`${basePath}?${params.toString()}`}
      className={cn(
        "inline-flex items-center gap-1 hover:text-foreground transition-colors",
        isActive ? "text-foreground font-medium" : "text-muted-foreground"
      )}
    >
      {label}
      {isActive ? (
        currentOrder === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-50" />
      )}
    </Link>
  );
}
