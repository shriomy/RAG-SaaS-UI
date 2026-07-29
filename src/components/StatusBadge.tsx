import { cn } from "../lib/utils";
import type { FileStatus } from "../types";

export function StatusBadge({ status }: { status: FileStatus }) {
  const config = {
    indexed: {
      label: "Indexed",
      className: "bg-success-subtle text-success border-success-border",
      dot: "bg-success",
    },
    processing: {
      label: "Processing",
      className: "bg-warning-subtle text-warning border-warning-border",
      dot: "bg-warning animate-pulse-soft",
    },
    failed: {
      label: "Failed",
      className: "bg-error-subtle text-error border-error-border",
      dot: "bg-error",
    },
  } as const;

  const c = config[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        c.className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", c.dot)} />
      {c.label}
    </span>
  );
}
