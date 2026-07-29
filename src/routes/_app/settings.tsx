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
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import {
  useAssistant,
  useKnowledgeFiles,
  updateAssistant,
} from "../../lib/queries";
import { AssistantSwitcher } from "../../components/AssistantSwitcher";
import { Button } from "../../components/Button";
import { StatusBadge } from "../../components/StatusBadge";
import { cn, formatBytes, formatRelativeTime } from "../../lib/utils";
import type { KnowledgeFile } from "../../types";

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

  // Set the first assistant as default if none selected
  useEffect(() => {
    if (!search.assistant) {
      void fetchInitial();
    }
  }, []);

  async function fetchInitial() {
    const { data } = await supabase
      .from("assistants")
      .select("id")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (data) {
      await navigate({
        to: "/settings",
        search: { assistant: data.id, tab },
        replace: true,
      });
    }
  }

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
      {/* Header with assistant switcher */}
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-bg-subtle px-5">
        <h1 className="text-base font-semibold text-text-bright">Settings</h1>
        <AssistantSwitcher
          activeId={search.assistant}
          onSelect={handleSelectAssistant}
          createLabel="Create new assistant"
        />
      </header>

      {/* Mode buttons */}
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
          Prompt configuration
        </TabButton>
      </div>

      {/* Sub-page content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {tab === "knowledge" ? (
          <KnowledgeSubPage assistantId={search.assistant} />
        ) : (
          <PromptSubPage
            assistantId={search.assistant}
            initialPrompt={assistant?.system_prompt ?? ""}
          />
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

function KnowledgeSubPage({ assistantId }: { assistantId: string | undefined }) {
  const queryClient = useQueryClient();
  const { data: files, isLoading } = useKnowledgeFiles(assistantId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const allowedTypes = ["application/pdf", "text/plain", "text/markdown"];
  const allowedExts = [".pdf", ".txt", ".md", ".markdown"];

  function getFileType(file: File): "pdf" | "txt" | "md" {
    if (file.type === "application/pdf" || file.name.endsWith(".pdf")) return "pdf";
    if (file.name.endsWith(".md") || file.name.endsWith(".markdown")) return "md";
    return "txt";
  }

  async function handleFiles(files: FileList) {
    if (!assistantId || files.length === 0) return;
    setUploadError(null);
    setUploading(true);

    try {
      for (const file of Array.from(files)) {
        const ext = "." + (file.name.split(".").pop() ?? "").toLowerCase();
        const valid =
          allowedTypes.includes(file.type) ||
          allowedExts.includes(ext) ||
          file.name.endsWith(".txt") ||
          file.name.endsWith(".md") ||
          file.name.endsWith(".pdf");
        if (!valid) {
          setUploadError(`${file.name}: unsupported file type`);
          continue;
        }

        const fileType = getFileType(file);
        const userId = (await supabase.auth.getUser()).data.user?.id;
        if (!userId) throw new Error("Not authenticated");

        const storagePath = `${userId}/${assistantId}/${Date.now()}-${file.name}`;
        const { error: uploadErr } = await supabase.storage
          .from("knowledge_files")
          .upload(storagePath, file);

        if (uploadErr) throw uploadErr;

        const { error: dbErr } = await supabase.from("knowledge_files").insert({
          assistant_id: assistantId,
          filename: file.name,
          file_type: fileType,
          storage_path: storagePath,
          status: "processing",
          file_size: file.size,
        });
        if (dbErr) throw dbErr;
      }

      await queryClient.invalidateQueries({
        queryKey: ["knowledge-files", assistantId],
      });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteFile(file: KnowledgeFile) {
    // Delete from storage
    if (file.storage_path) {
      await supabase.storage.from("knowledge_files").remove([file.storage_path]);
    }
    await supabase.from("knowledge_files").delete().eq("id", file.id);
    await queryClient.invalidateQueries({
      queryKey: ["knowledge-files", assistantId],
    });
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
      {/* Upload section */}
      <section>
        <h2 className="text-sm font-semibold text-text-bright mb-1">Upload Files</h2>
        <p className="text-xs text-text-faint mb-4">
          Supported formats: PDF, TXT, Markdown
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
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-bg-elevate">
                <Upload className="h-5 w-5 text-text-muted" />
              </div>
              <p className="text-sm font-medium text-text-bright">
                Drag and drop files here
              </p>
              <p className="text-xs text-text-faint">
                or click to browse
              </p>
            </div>
          )}
        </div>
        {uploadError && (
          <div className="mt-3 rounded-lg border border-error-border bg-error-subtle px-3 py-2 text-xs text-error animate-slide-down">
            {uploadError}
          </div>
        )}
      </section>

      {/* Uploaded files table */}
      <section>
        <h2 className="text-sm font-semibold text-text-bright mb-4">Uploaded Files</h2>
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-bg-subtle">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-faint">
                  File
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-faint">
                  Size
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-faint">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-faint">
                  Uploaded
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-text-faint">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin text-text-faint" />
                  </td>
                </tr>
              )}
              {!isLoading && (!files || files.length === 0) && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-sm text-text-faint">
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
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-text-bright">
                          {file.filename}
                        </span>
                        <span className="text-xs text-text-faint uppercase">
                          {file.file_type}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-text-muted">
                    {formatBytes(file.file_size)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={file.status} />
                  </td>
                  <td className="px-4 py-3 text-sm text-text-muted">
                    {formatRelativeTime(file.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleDeleteFile(file)}
                        className="rounded-lg p-2 text-text-faint transition-colors hover:bg-error-subtle hover:text-error"
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

/* ---------- Prompt configuration sub-page ---------- */

function PromptSubPage({
  assistantId,
  initialPrompt,
}: {
  assistantId: string | undefined;
  initialPrompt: string;
}) {
  const queryClient = useQueryClient();
  const [prompt, setPrompt] = useState(initialPrompt);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setPrompt(initialPrompt);
  }, [initialPrompt]);

  async function handleSave() {
    if (!assistantId) return;
    setSaving(true);
    setSaved(false);
    try {
      await updateAssistant(assistantId, { system_prompt: prompt });
      await queryClient.invalidateQueries({ queryKey: ["assistant", assistantId] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  const dirty = prompt !== initialPrompt;

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-text-bright mb-1">System Prompt</h2>
        <p className="text-xs text-text-faint mb-4">
          This prompt defines how the assistant behaves and responds. It is sent to the
          LLM at the start of every conversation.
        </p>
      </div>

      <div className="space-y-2">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="You are a helpful assistant that answers questions based on the provided knowledge base…"
          rows={12}
          className="w-full resize-y rounded-xl border border-border bg-bg-input px-4 py-3 font-mono text-sm leading-relaxed text-text-bright placeholder:text-text-faint transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary scrollbar-thin"
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-text-faint">{prompt.length} characters</span>
          <div className="flex items-center gap-3">
            {saved && (
              <span className="flex items-center gap-1.5 text-xs text-success animate-fade-in">
                <Check className="h-3.5 w-3.5" />
                Saved
              </span>
            )}
            <Button
              variant="primary"
              onClick={handleSave}
              disabled={!dirty || saving || !assistantId}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Save prompt
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
