import { useState } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  MessageSquare,
  Bot,
  Settings,
  LogOut,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { cn, initialsFromEmail } from "../lib/utils";
import { Dropdown, DropdownItem, DropdownSeparator } from "./Dropdown";

const navItems = [
  { to: "/chat", label: "Chat", icon: MessageSquare },
  { to: "/assistants", label: "Assistants", icon: Bot },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  const email = user?.email ?? "";
  const isActive = (to: string) => location.pathname.startsWith(to);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
      await navigate({ to: "/" });
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border bg-bg-subtle">
      <div className="flex h-16 items-center gap-2.5 border-b border-border px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15">
          <svg viewBox="0 0 24 24" className="h-5 w-5 text-primary" fill="none">
            <path
              d="M12 2L3 7v10l9 5 9-5V7l-9-5z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            <path
              d="M12 12l9-5M12 12L3 7M12 12v10"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="flex flex-col leading-none">
          <span className="text-sm font-semibold text-text-bright">RAG</span>
          <span className="text-[11px] text-text-faint">System</span>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => {
          const active = isActive(item.to);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
                active
                  ? "bg-primary-subtle text-text-bright border border-primary-border"
                  : "text-text-muted hover:bg-bg-hover hover:text-text-bright border border-transparent",
              )}
            >
              <Icon
                className={cn(
                  "h-4 w-4 shrink-0 transition-colors",
                  active ? "text-primary" : "text-text-faint group-hover:text-text-muted",
                )}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-3">
        <Dropdown
          trigger={
            <div className="flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-bg-hover">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-hover text-xs font-semibold text-white">
                {initialsFromEmail(email)}
              </div>
              <div className="flex min-w-0 flex-1 flex-col leading-tight text-left">
                <span className="truncate text-sm font-medium text-text-bright">
                  {email.split("@")[0] ?? "User"}
                </span>
                <span className="truncate text-xs text-text-faint">{email}</span>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-text-faint" />
            </div>
          }
          align="left"
          className="bottom-full mb-2 top-auto"
        >
          {(close) => (
            <>
              <div className="px-3 py-2">
                <div className="text-sm font-medium text-text-bright truncate">
                  {email.split("@")[0] ?? "User"}
                </div>
                <div className="text-xs text-text-faint truncate">{email}</div>
              </div>
              <DropdownSeparator />
              <DropdownItem
                icon={<LogOut className="h-4 w-4" />}
                onClick={() => {
                  void handleSignOut();
                  close();
                }}
                className={signingOut ? "opacity-50" : "text-error hover:text-error"}
              >
                {signingOut ? "Signing out…" : "Log out"}
              </DropdownItem>
            </>
          )}
        </Dropdown>
      </div>
    </aside>
  );
}
