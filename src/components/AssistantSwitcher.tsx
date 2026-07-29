import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronDown, Plus, Sparkles, Check } from "lucide-react";
import { useAssistants, createAssistant } from "../lib/queries";
import { useQueryClient } from "@tanstack/react-query";
import { Dropdown, DropdownItem, DropdownSeparator } from "./Dropdown";
import { cn } from "../lib/utils";

export function AssistantSwitcher({
  activeId,
  onSelect,
  showCreate = true,
  createLabel = "Create new assistant",
  variant = "header",
}: {
  activeId: string | null | undefined;
  onSelect: (id: string) => void;
  showCreate?: boolean;
  createLabel?: string;
  variant?: "header" | "compact";
}) {
  const navigate = useNavigate();
  const { data: assistants, isLoading } = useAssistants();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);

  const active = assistants?.find((a) => a.id === activeId);
  const activeName = active?.name ?? "Select assistant";

  async function handleCreate() {
    setCreating(true);
    try {
      const name = `Assistant ${(assistants?.length ?? 0) + 1}`;
      const created = await createAssistant(name);
      await queryClient.invalidateQueries({ queryKey: ["assistants"] });
      onSelect(created.id);
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dropdown
      trigger={
        variant === "header" ? (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-bg-elevate px-3 py-2 transition-colors hover:bg-bg-hover hover:border-border-strong">
            <Sparkles className="h-4 w-4 text-primary shrink-0" />
            <span className="text-sm font-medium text-text-bright truncate max-w-[180px]">
              {isLoading ? "Loading…" : activeName}
            </span>
            <ChevronDown className="h-4 w-4 text-text-faint shrink-0" />
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-1.5 text-sm text-text-muted hover:text-text-bright">
            <span className="truncate max-w-[140px]">{activeName}</span>
            <ChevronDown className="h-3.5 w-3.5" />
          </div>
        )
      }
    >
      {(close) => (
        <>
          <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-faint">
            Assistants
          </div>
          <div className="max-h-64 overflow-y-auto scrollbar-thin">
            {assistants?.length === 0 && !isLoading && (
              <div className="px-3 py-4 text-center text-sm text-text-faint">
                No assistants yet
              </div>
            )}
            {assistants?.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  onSelect(a.id);
                  close();
                }}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-sm text-left transition-colors hover:bg-bg-hover",
                  a.id === activeId ? "text-text-bright" : "text-text-muted",
                )}
              >
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary/70" />
                <span className="flex-1 truncate">{a.name}</span>
                {a.id === activeId && <Check className="h-4 w-4 text-primary" />}
              </button>
            ))}
          </div>
          {showCreate && (
            <>
              <DropdownSeparator />
              <DropdownItem
                icon={<Plus className="h-4 w-4" />}
                onClick={() => {
                  if (variant === "header") {
                    void handleCreate();
                    close();
                  } else {
                    void navigate({ to: "/assistants" });
                    close();
                  }
                }}
                className="text-primary hover:text-primary-hover"
              >
                {creating ? "Creating…" : createLabel}
              </DropdownItem>
            </>
          )}
        </>
      )}
    </Dropdown>
  );
}
