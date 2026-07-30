import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  FileText,
  Upload,
  Loader2,
  Trash2,
  File as FileIcon,
  Check,
  Save,
  RefreshCw,
  AlertTriangle,
  Database,
  ExternalLink,
  Cpu,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../lib/api";
import {
  queryKeys,
  useAssistant,
  useKnowledgeFiles,
  useKnowledgeStats,
  updateAssistant,
  uploadKnowledgeFile,
  reindexKnowledgeFile,
  deleteKnowledgeFile,
  useAssistants,
} from "../../lib/queries";
import { MODEL_SUGGESTIONS, OPENROUTER_MODELS_URL } from "../../lib/models";
import { AssistantSwitcher } from "../../components/AssistantSwitcher";
import { Button } from "../../components/Button";
import { StatusBadge } from "../../components/StatusBadge";
import { cn, formatBytes, formatRelativeTime } from "../../lib/utils";
import type { Assistant, KnowledgeFile } from "../../types";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
  validateSearch: (search: Record<string, unknown>) => ({
    assistant: (search.assistant as string) ?? undefined,
    tab: (search.tab as "knowledge" | "prompt" | undefined) ?? "knowledge",
  }),
});

type Tab = "knowledge" | "prompt";

function SettingsPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/_app/settings" });
  const tab: Tab = search.tab ?? "knowledge";
  const { data: assistant } = useAssistant(search.assistant);
  const { data: assistants } = useAssistants();

  // Default to the first assistant when none is in the URL.
  useEffect(() => {
    if (!search.assistant && assistants && assistants.length > 0) {
      void navigate({
        to: "/settings",
        search: { assistant: assistants[0]!.id, tab },
        replace: true,
      });
    }
  }, [search.assistant, assistants, tab, navigate]);

  function handleSelectAssistant(id: string) {
    void navigate({
      to: "/settings",
      search: { assistant: id, tab },
      replace: true,
    });
  }

  function handleTabChange(newTab: Tab) {
    void navigate({
      to: "/settings",
      search: { assistant: search.assistant, tab: newTab },
      replace: true,
    });
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-bg-subtle px-5">
        <h1 className="text-base font-semibold text-text-bright">Settings</h1>
        <AssistantSwitcher
          activeId={search.assistant}
          onSelect={handleSelectAssistant}
          createLabel="Create new assistant"
        />
      </header>

      <div className="flex shrink-0 gap-1 border-b border-border bg-bg-subtle px-5 pt-3">
        <TabButton
          active={tab === "knowledge"}
          onClick={() => handleTabChange("knowledge")}
          icon={<BookOpen className="h-4 w-4" />}
        >
          Knowledge
        </TabButton>
        <TabButton
          active={tab === "prompt"}
          onClick={() => handleTabChange("prompt")}
          icon={<FileText className="h-4 w-4" />}
        >
          Prompt &amp; model
        </TabButton>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {tab === "knowledge" ? (
          <KnowledgeSubPage assistantId={search.assistant} />
        ) : (
          <PromptSubPage assistant={assistant ?? null} />
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors -mb-px",
        active
          ? "border-primary text-text-bright"
          : "border-transparent text-text-faint hover:text-text-muted",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

/* ---------- Knowledge sub-page ---------- */

const ALLOWED_EXTENSIONS = [".pdf", ".txt", ".md", ".markdown"];

function KnowledgeSubPage({ assistantId }: { assistantId: string | undefined }) {
  const queryClient = useQueryClient();
  const { data: files, isLoading } = useKnowledgeFiles(assistantId);
  const { data: stats } = useKnowledgeStats(assistantId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busyFileId, setBusyFileId] = useState<string | null>(null);

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.knowledgeFiles(assistantId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.knowledgeStats(assistantId) }),
    ]);
  }

  /**
   * Uploads go through the backend, which stores the blob AND starts indexing.
   * (Uploading straight to Supabase Storage would leave the file un-embedded and
   * stuck at "processing" forever.)
   */
  async function handleFiles(selected: FileList) {
    if (!assistantId || selected.length === 0) return;
    setUploadError(null);
    setUploading(true);

    try {
      for (const file of Array.from(selected)) {
        const ext = "." + (file.name.split(".").pop() ?? "").toLowerCase();
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
          setUploadError(`${file.name}: unsupported file type. Use PDF, TXT or MD.`);
          continue;
        }

        try {
          await uploadKnowledgeFile(assistantId, file);
        } catch (err) {
          setUploadError(
            err instanceof ApiError
              ? `${file.name}: ${err.message}`
              : `${file.name}: upload failed`,
          );
        }
      }
      await refresh();
    } finally {
      setUploading(false);
      // Allow re-selecting the same file after a failure.
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleReindex(file: KnowledgeFile) {
    setBusyFileId(file.id);
    setUploadError(null);
    try {
      const updated = await reindexKnowledgeFile(file.id);
      if (updated.status === "failed") {
        setUploadError(`${file.filename}: ${updated.error_message ?? "indexing failed"}`);
      }
      await refresh();
    } catch (err) {
      setUploadError(
        err instanceof ApiError ? err.message : "Could not re-index the file.",
      );
    } finally {
      setBusyFileId(null);
    }
  }

  async function handleDeleteFile(file: KnowledgeFile) {
    setBusyFileId(file.id);
    try {
      // Removes the row, the storage blob and the vectors in one call.
      await deleteKnowledgeFile(file.id);
      await refresh();
    } catch (err) {
      setUploadError(
        err instanceof ApiError ? err.message : "Could not delete the file.",
      );
    } finally {
      setBusyFileId(null);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      void handleFiles(e.dataTransfer.files);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8 space-y-8">
      {/* Upload */}
      <section>
        <h2 className="text-sm font-semibold text-text-bright mb-1">Upload Files</h2>
        <p className="text-xs text-text-faint mb-4">
          PDF, TXT or Markdown. Files are chunked, embedded and indexed into the
          vector store automatically.
        </p>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed py-10 transition-colors",
            !assistantId && "pointer-events-none opacity-50",
            dragOver
              ? "border-primary bg-primary-subtle"
              : "border-border bg-bg-subtle hover:border-border-strong hover:bg-bg-elevate",
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.txt,.md,.markdown,application/pdf,text/plain,text/markdown"
            className="hidden"
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
          />
          {uploading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-xs text-text-faint">Uploading…</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-bg-elevate">
                <Upload className="h-5 w-5 text-text-muted" />
              </div>
              <p className="text-sm font-medium text-text-bright">
                Drag and drop files here
              </p>
              <p className="text-xs text-text-faint">or click to browse</p>
            </div>
          )}
        </div>
        {uploadError && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-error-border bg-error-subtle px-3 py-2 text-xs text-error animate-slide-down">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="break-words">{uploadError}</span>
          </div>
        )}
      </section>

      {/* Stats */}
      {stats && stats.total_files > 0 && (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Files" value={stats.total_files} />
          <StatCard label="Indexed" value={stats.indexed} />
          <StatCard
            label="Chunks in vector store"
            value={stats.vector_count}
            icon={<Database className="h-3.5 w-3.5" />}
          />
          <StatCard label="Total size" value={formatBytes(stats.total_bytes)} />
        </section>
      )}

      {/* File table */}
      <section>
        <h2 className="text-sm font-semibold text-text-bright mb-4">Uploaded Files</h2>
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-bg-subtle">
                <Th>File</Th>
                <Th>Size</Th>
                <Th>Chunks</Th>
                <Th>Status</Th>
                <Th>Uploaded</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin text-text-faint" />
                  </td>
                </tr>
              )}
              {!isLoading && (!files || files.length === 0) && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-12 text-center text-sm text-text-faint"
                  >
                    No files uploaded yet
                  </td>
                </tr>
              )}
              {files?.map((file) => (
                <tr key={file.id} className="transition-colors hover:bg-bg-subtle/60">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-bg-elevate">
                        <FileIcon className="h-4 w-4 text-text-muted" />
                      </div>
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-medium text-text-bright">
                          {file.filename}
                        </span>
                        <span className="text-xs uppercase text-text-faint">
                          {file.file_type}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-text-muted">
                    {formatBytes(file.file_size)}
                  </td>
                  <td className="px-4 py-3 text-sm text-text-muted">
                    {file.chunk_count || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <StatusBadge status={file.status} />
                      {file.status === "failed" && file.error_message && (
                        <span
                          title={file.error_message}
                          className="max-w-[180px] truncate text-[11px] text-error"
                        >
                          {file.error_message}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-text-muted">
                    {formatRelativeTime(file.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        title="Re-index this file"
                        disabled={busyFileId === file.id}
                        onClick={() => void handleReindex(file)}
                        className="rounded-lg p-2 text-text-faint transition-colors hover:bg-bg-hover hover:text-text-bright disabled:opacity-40"
                      >
                        {busyFileId === file.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                      </button>
                      <button
                        type="button"
                        title="Delete file and its vectors"
                        disabled={busyFileId === file.id}
                        onClick={() => void handleDeleteFile(file)}
                        className="rounded-lg p-2 text-text-faint transition-colors hover:bg-error-subtle hover:text-error disabled:opacity-40"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Th({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={cn(
        "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-faint",
        className,
      )}
    >
      {children}
    </th>
  );
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-bg-subtle px-4 py-3">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-text-faint">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold text-text-bright">{value}</div>
    </div>
  );
}

/* ---------- Prompt & model sub-page ---------- */

function PromptSubPage({ assistant }: { assistant: Assistant | null }) {
  const queryClient = useQueryClient();

  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("");
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(1024);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reload the form whenever a different assistant is selected.
  useEffect(() => {
    if (!assistant) return;
    setPrompt(assistant.system_prompt);
    setModel(assistant.model);
    setTemperature(assistant.temperature);
    setMaxTokens(assistant.max_tokens);
    setSaved(false);
    setError(null);
  }, [assistant?.id, assistant?.system_prompt, assistant?.model]);

  const dirty =
    !!assistant &&
    (prompt !== assistant.system_prompt ||
      model.trim() !== assistant.model ||
      temperature !== assistant.temperature ||
      maxTokens !== assistant.max_tokens);

  async function handleSave() {
    if (!assistant || !dirty) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await updateAssistant(assistant.id, {
        system_prompt: prompt,
        model: model.trim(),
        temperature,
        max_tokens: maxTokens,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.assistant(assistant.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.assistants }),
      ]);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save changes.");
    } finally {
      setSaving(false);
    }
  }

  if (!assistant) {
    return (
      <div className="px-6 py-16 text-center text-sm text-text-faint">
        Select an assistant to configure it.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 space-y-8">
      {/* System prompt */}
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-text-bright mb-1">System Prompt</h2>
          <p className="text-xs text-text-faint">
            Defines how the assistant behaves. The backend layers this with the
            user's long-term memory, the conversation summary and retrieved
            document chunks on every turn.
          </p>
        </div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="You are a helpful assistant that answers questions based on the provided knowledge base…"
          rows={10}
          className="w-full resize-y rounded-xl border border-border bg-bg-input px-4 py-3 font-mono text-sm leading-relaxed text-text-bright placeholder:text-text-faint transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary scrollbar-thin"
        />
        <span className="text-xs text-text-faint">{prompt.length} characters</span>
      </section>

      {/* Model configuration */}
      <section className="space-y-4">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-text-bright mb-1">
            <Cpu className="h-4 w-4 text-primary" />
            Model
          </h2>
          <p className="text-xs text-text-faint">
            Any OpenRouter model slug. Changing it takes effect on the next
            message — no restart or redeploy.{" "}
            <a
              href={OPENROUTER_MODELS_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-0.5 text-primary hover:underline"
            >
              Browse models
              <ExternalLink className="h-3 w-3" />
            </a>
          </p>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-text-muted">
            Model slug
          </label>
          <input
            list="model-suggestions"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="openai/gpt-4o-mini"
            spellCheck={false}
            className="h-10 w-full rounded-lg border border-border bg-bg-input px-3 font-mono text-sm text-text-bright placeholder:text-text-faint transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <datalist id="model-suggestions">
            {MODEL_SUGGESTIONS.map((suggestion) => (
              <option key={suggestion.slug} value={suggestion.slug}>
                {suggestion.label} — {suggestion.note}
              </option>
            ))}
          </datalist>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-xs font-medium text-text-muted">Temperature</label>
              <span className="font-mono text-xs text-text-bright">
                {temperature.toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={temperature}
              onChange={(e) => setTemperature(Number(e.target.value))}
              className="w-full accent-primary"
            />
            <p className="mt-1 text-[11px] text-text-faint">
              Lower is more deterministic. 0.2–0.4 suits grounded Q&amp;A.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-text-muted">
              Max tokens
            </label>
            <input
              type="number"
              min={1}
              max={200000}
              value={maxTokens}
              onChange={(e) => setMaxTokens(Number(e.target.value))}
              className="h-10 w-full rounded-lg border border-border bg-bg-input px-3 text-sm text-text-bright transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <p className="mt-1 text-[11px] text-text-faint">
              Upper bound on the answer length.
            </p>
          </div>
        </div>
      </section>

      {/* Save bar */}
      <div className="flex items-center justify-between border-t border-border pt-4">
        {error ? (
          <span className="flex items-start gap-1.5 text-xs text-error">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {error}
          </span>
        ) : (
          <span className="text-xs text-text-faint">
            {dirty ? "Unsaved changes" : "All changes saved"}
          </span>
        )}
        <div className="flex items-center gap-3">
          {saved && (
            <span className="flex items-center gap-1.5 text-xs text-success animate-fade-in">
              <Check className="h-3.5 w-3.5" />
              Saved
            </span>
          )}
          <Button variant="primary" onClick={handleSave} disabled={!dirty || saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save changes
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
