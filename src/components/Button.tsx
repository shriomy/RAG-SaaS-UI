import type { ReactNode } from "react";
import { cn } from "../lib/utils";

export function Button({
  variant = "default",
  size = "md",
  className,
  children,
  ...props
}: {
  variant?: "default" | "primary" | "ghost" | "danger" | "outline";
  size?: "sm" | "md" | "lg" | "icon";
} & React.ButtonHTMLAttributes<HTMLButtonElement> & { children?: ReactNode }) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-50 disabled:pointer-events-none select-none";
  const variants = {
    default:
      "bg-bg-elevate text-text-bright border border-border hover:bg-bg-hover hover:border-border-strong",
    primary:
      "bg-primary text-white hover:bg-primary-hover shadow-sm shadow-primary/20",
    ghost: "text-text-muted hover:text-text-bright hover:bg-bg-hover",
    danger:
      "bg-error-subtle text-error border border-error-border hover:bg-error/20",
    outline:
      "border border-border text-text-bright hover:bg-bg-hover hover:border-border-strong",
  };
  const sizes = {
    sm: "h-8 px-3 text-xs",
    md: "h-10 px-4 text-sm",
    lg: "h-12 px-6 text-base",
    icon: "h-9 w-9",
  };
  return (
    <button className={cn(base, variants[variant], sizes[size], className)} {...props}>
      {children}
    </button>
  );
}
