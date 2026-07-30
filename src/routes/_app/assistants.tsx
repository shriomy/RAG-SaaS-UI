import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  Plus,
  MoreHorizontal,
  Eye,
  Pencil,
  Trash2,
  Power,
  PencilLine,
  Sparkles,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../lib/api";
import {
  queryKeys,
  useAssistants,
  createAssistant,
  updateAssistant,
  deleteAssistant,
  setActiveAssistant,
} from "../../lib/queries";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { Dropdown, DropdownItem, DropdownSeparator } from "../../components/Dropdown";
import { cn, formatRelativeTime } from "../../lib/utils";
import type { Assistant } from "../../types";

export const Route = createFileRoute("/_app/assistants")({
  component: AssistantsPage,
});

function AssistantsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: assistants, isLoading } = useAssistants();

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<Assistant | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [viewing, setViewing] = useState<Assistant | null>(null);
  const [deleting, setDeleting] = useState<Assistant | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Every mutation shares the same loading/error/refresh handling. */
  async function run(action: () => Promise<unknown>, fallbackMessage: string) {
    setActionLoading(true);
    setError(null);
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: queryKeys.assistants });
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : fallbackMessage);
      return false;
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    const ok = await run(
      () => createAssistant(newName.trim()),
      "Could not create the assistant.",
    );
    if (ok) {
      setNewName("");
      setCreating(false);
    }
  }

  async function handleRename() {
    if (!renaming || !renameValue.trim()) return;
    const ok = await run(
      () => updateAssistant(renaming.id, { name: renameValue.trim() }),
      "Could not rename the assistant.",
    );
    if (ok) {
      setRenaming(null);
      setRenameValue("");
    }
  }

  async function handleActivate(id: string) {
    await run(() => setActiveAssistant(id), "Could not activate the assistant.");
  }

  async function handleDelete() {
    if (!deleting) return;
    // The backend also purges this assistant's vectors and storage blobs.
    const ok = await run(
      () => deleteAssistant(deleting.id),
      "Could not delete the assistant.",
    );
    if (ok) setDeleting(null);
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* No header per requirement — just a toolbar within the page */}
      <div className="flex items-center justify-between px-6 py-5">
        <div>
          <h1 className="text-lg font-semibold text-text-bright">Assistants</h1>
          <p className="mt-0.5 text-sm text-text-faint">
            Manage your RAG assistants
          </p>
        </div>
        <Button variant="primary" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" />
          Create assistant
        </Button>
      </div>

      {error && (
        <div className="mx-6 mb-4 flex items-start gap-2 rounded-lg border border-error-border bg-error-subtle px-3 py-2 text-xs text-error animate-slide-down">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="break-words">{error}</span>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-6 pb-6">
        <div className="relative overflow-visible rounded-xl border border-border">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-bg-subtle">
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-faint">
                  Name
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-faint">
                  Model
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-faint">
                  Status
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-faint">
                  Created
                </th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-text-faint">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading && (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-text-faint" />
                  </td>
                </tr>
              )}
              {!isLoading && assistants?.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-bg-elevate">
                        <Sparkles className="h-6 w-6 text-text-faint" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-text-bright">No assistants yet</p>
                        <p className="mt-0.5 text-xs text-text-faint">
                          Create your first assistant to get started
                        </p>
                      </div>
                      <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
                        <Plus className="h-4 w-4" />
                        Create assistant
                      </Button>
                    </div>
                  </td>
                </tr>
              )}
              {assistants?.map((a) => (
                <tr
                  key={a.id}
                  className="group transition-colors hover:bg-bg-subtle/60"
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-subtle">
                        <Sparkles className="h-4 w-4 text-primary" />
                      </div>
                      <span className="text-sm font-medium text-text-bright">{a.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="rounded-md border border-border bg-bg-elevate px-2 py-0.5 font-mono text-[11px] text-text-muted">
                      {a.model}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    {a.is_active ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-success-border bg-success-subtle px-2.5 py-0.5 text-xs font-medium text-success">
                        <span className="h-1.5 w-1.5 rounded-full bg-success" />
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg-elevate px-2.5 py-0.5 text-xs font-medium text-text-faint">
                        <span className="h-1.5 w-1.5 rounded-full bg-text-faint" />
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-sm text-text-muted">
                    {formatRelativeTime(a.created_at)}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end">
                      <Dropdown
                        trigger={
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg text-text-faint transition-colors hover:bg-bg-hover hover:text-text-bright">
                            <MoreHorizontal className="h-4 w-4" />
                          </div>
                        }
                        align="right"
                      >
                        {(close) => (
                          <>
                            <DropdownItem
                              icon={<Eye className="h-4 w-4" />}
                              onClick={() => {
                                setViewing(a);
                                close();
                              }}
                            >
                              View details
                            </DropdownItem>
                            <DropdownItem
                              icon={<Pencil className="h-4 w-4" />}
                              onClick={() => {
                                navigate({
                                  to: "/settings",
                                  search: { assistant: a.id, tab: "knowledge" },
                                });
                                close();
                              }}
                            >
                              Edit
                            </DropdownItem>
                            <DropdownItem
                              icon={<PencilLine className="h-4 w-4" />}
                              onClick={() => {
                                setRenaming(a);
                                setRenameValue(a.name);
                                close();
                              }}
                            >
                              Rename
                            </DropdownItem>
                            <DropdownItem
                              icon={<Power className="h-4 w-4" />}
                              onClick={() => {
                                void handleActivate(a.id);
                                close();
                              }}
                              disabled={a.is_active}
                              className={a.is_active ? "opacity-40" : ""}
                            >
                              {a.is_active ? "Already active" : "Activate"}
                            </DropdownItem>
                            <DropdownSeparator />
                            <DropdownItem
                              icon={<Trash2 className="h-4 w-4" />}
                              onClick={() => {
                                setDeleting(a);
                                close();
                              }}
                              className="text-error hover:text-error"
                            >
                              Delete
                            </DropdownItem>
                          </>
                        )}
                      </Dropdown>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create modal */}
      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="Create new assistant"
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-text-muted">
              Assistant name
            </label>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              placeholder="e.g. Support Bot"
              className="h-10 w-full rounded-lg border border-border bg-bg-input px-3 text-sm text-text-bright placeholder:text-text-faint transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleCreate} disabled={!newName.trim() || actionLoading}>
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Rename modal */}
      <Modal
        open={!!renaming}
        onClose={() => setRenaming(null)}
        title="Rename assistant"
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-text-muted">
              Assistant name
            </label>
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRename()}
              className="h-10 w-full rounded-lg border border-border bg-bg-input px-3 text-sm text-text-bright placeholder:text-text-faint transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRenaming(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleRename} disabled={!renameValue.trim() || actionLoading}>
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* View details modal */}
      <Modal
        open={!!viewing}
        onClose={() => setViewing(null)}
        title="Assistant details"
      >
        {viewing && (
          <div className="space-y-3">
            <DetailRow label="Name" value={viewing.name} />
            <DetailRow label="ID" value={viewing.id} mono />
            <DetailRow
              label="Status"
              value={viewing.is_active ? "Active" : "Inactive"}
            />
            <DetailRow label="Model" value={viewing.model} mono />
            <DetailRow label="Temperature" value={viewing.temperature.toFixed(2)} />
            <DetailRow label="Max tokens" value={String(viewing.max_tokens)} />
            <DetailRow label="System prompt" value={viewing.system_prompt || "(empty)"} />
            <DetailRow label="Created" value={new Date(viewing.created_at).toLocaleString()} />
            <div className="flex justify-end pt-2">
              <Button
                variant="primary"
                onClick={() => {
                  navigate({ to: "/settings", search: { assistant: viewing.id, tab: "knowledge" } });
                  setViewing(null);
                }}
              >
                <Pencil className="h-4 w-4" />
                Edit in settings
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete confirmation */}
      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete assistant"
      >
        {deleting && (
          <div className="space-y-4">
            <p className="text-sm text-text-muted">
              Are you sure you want to delete{" "}
              <span className="font-medium text-text-bright">{deleting.name}</span>? This will
              also delete all associated knowledge files. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDeleting(null)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={handleDelete} disabled={actionLoading}>
                {actionLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex gap-3">
      <span className="w-28 shrink-0 text-xs font-medium text-text-faint">{label}</span>
      <span
        className={cn(
          "flex-1 text-sm text-text-bright break-words",
          mono && "font-mono text-xs",
        )}
      >
        {value}
      </span>
    </div>
  );
}
