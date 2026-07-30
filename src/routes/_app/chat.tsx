import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Send,
  Plus,
  MessageSquare,
  Trash2,
  Sparkles,
  User as UserIcon,
  Square,
  FileText,
  AlertTriangle,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError, streamChat } from "../../lib/api";
import {
  queryKeys,
  useAssistants,
  useConversations,
  useMessages,
  useRefreshAfterChat,
  deleteConversation,
  setActiveAssistant,
} from "../../lib/queries";
import { AssistantSwitcher } from "../../components/AssistantSwitcher";
import { Button } from "../../components/Button";
import { cn, formatRelativeTime } from "../../lib/utils";
import type { Citation, TokenUsage } from "../../types";

export const Route = createFileRoute("/_app/chat")({
  component: ChatPage,
});

/** What the last completed turn was grounded on, shown under the answer. */
type TurnMeta = {
  citations: Citation[];
  usage: TokenUsage | null;
  model: string | null;
};

function ChatPage() {
  const queryClient = useQueryClient();
  const refreshAfterChat = useRefreshAfterChat();
  const { data: assistants } = useAssistants();

  const [activeAssistantId, setActiveAssistantId] = useState<string | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");

  // Streaming state. `pendingQuestion` renders the user's bubble optimistically,
  // because the backend only persists both messages once generation finishes.
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [streamedAnswer, setStreamedAnswer] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastTurn, setLastTurn] = useState<TurnMeta | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: conversations } = useConversations(activeAssistantId);
  const { data: messages } = useMessages(activeConversationId);

  const activeAssistant = assistants?.find((a) => a.id === activeAssistantId);

  /* --------------------------------------------------------------------- */
  /* Effects                                                                */
  /* --------------------------------------------------------------------- */

  // Pick an assistant on first load: the active one, else the first.
  useEffect(() => {
    if (assistants && assistants.length > 0 && !activeAssistantId) {
      const active = assistants.find((a) => a.is_active) ?? assistants[0]!;
      setActiveAssistantId(active.id);
    }
  }, [assistants, activeAssistantId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamedAnswer, pendingQuestion]);

  // Cancel an in-flight stream if the page unmounts.
  useEffect(() => () => abortRef.current?.abort(), []);

  /* --------------------------------------------------------------------- */
  /* Handlers                                                               */
  /* --------------------------------------------------------------------- */

  async function handleSelectAssistant(id: string) {
    setActiveAssistantId(id);
    setActiveConversationId(null);
    resetTurnState();
    await setActiveAssistant(id);
    await queryClient.invalidateQueries({ queryKey: queryKeys.assistants });
  }

  /**
   * "New chat" only clears local state. The conversation row is created by the
   * backend on the first message, so an abandoned draft never leaves an empty
   * conversation in the sidebar.
   */
  function handleNewChat() {
    setActiveConversationId(null);
    resetTurnState();
    textareaRef.current?.focus();
  }

  function handleSelectConversation(id: string) {
    setActiveConversationId(id);
    resetTurnState();
  }

  function resetTurnState() {
    setPendingQuestion(null);
    setStreamedAnswer("");
    setError(null);
    setLastTurn(null);
  }

  async function handleDeleteConversation(id: string) {
    try {
      await deleteConversation(id);
      if (activeConversationId === id) {
        setActiveConversationId(null);
        resetTurnState();
      }
      await queryClient.invalidateQueries({
        queryKey: queryKeys.conversations(activeAssistantId),
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete conversation.");
    }
  }

  function handleStop() {
    // Aborts reading only. The backend finishes the run on purpose so the answer
    // is still saved; the refetch below picks up the complete version.
    abortRef.current?.abort();
  }

  async function handleSend() {
    const question = input.trim();
    if (!question || !activeAssistantId || sending) return;

    const controller = new AbortController();
    abortRef.current = controller;

    setInput("");
    setError(null);
    setLastTurn(null);
    setPendingQuestion(question);
    setStreamedAnswer("");
    setSending(true);

    // Tracked separately from state: a new conversation's id arrives in the
    // `start` event, and the cleanup path needs it even after an abort.
    let conversationId = activeConversationId;
    let answer = "";

    try {
      const stream = streamChat(
        {
          question,
          assistant_id: activeAssistantId,
          conversation_id: activeConversationId,
        },
        controller.signal,
      );

      for await (const event of stream) {
        switch (event.type) {
          case "start":
            conversationId = event.conversation_id;
            if (event.is_new_conversation) {
              setActiveConversationId(event.conversation_id);
              // Show the new thread in the sidebar right away.
              await queryClient.invalidateQueries({
                queryKey: queryKeys.conversations(activeAssistantId),
              });
            }
            break;

          case "token":
            answer += event.content;
            setStreamedAnswer(answer);
            break;

          case "revision":
            // A guardrail rewrote the answer — replace what we rendered.
            answer = event.content;
            setStreamedAnswer(answer);
            break;

          case "done":
            conversationId = event.conversation_id;
            setLastTurn({
              citations: event.citations,
              usage: event.usage,
              model: event.model,
            });
            if (event.warning) setError(event.warning);
            break;

          case "error":
            setError(event.message);
            break;
        }
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === "aborted") {
        // Expected: the user pressed Stop.
      } else if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Something went wrong while streaming the response.");
      }
    } finally {
      abortRef.current = null;
      setSending(false);

      // Swap the optimistic bubbles for the persisted messages.
      if (conversationId) {
        await refreshAfterChat(conversationId, activeAssistantId);
      }
      setPendingQuestion(null);
      setStreamedAnswer("");
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  const showEmptyState =
    !pendingQuestion && (!activeConversationId || messages?.length === 0);

  /* --------------------------------------------------------------------- */
  /* Render                                                                 */
  /* --------------------------------------------------------------------- */

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Conversation list */}
      <div className="flex w-64 shrink-0 flex-col border-r border-border bg-bg-subtle">
        <div className="p-3 border-b border-border">
          <Button variant="primary" className="w-full" onClick={handleNewChat}>
            <Plus className="h-4 w-4" />
            New chat
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin px-2 py-2 space-y-0.5">
          {conversations?.length === 0 && (
            <div className="px-3 py-8 text-center text-sm text-text-faint">
              No conversations yet
            </div>
          )}
          {conversations?.map((conv) => (
            <button
              key={conv.id}
              type="button"
              onClick={() => handleSelectConversation(conv.id)}
              className={cn(
                "group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                conv.id === activeConversationId
                  ? "bg-bg-hover text-text-bright"
                  : "text-text-muted hover:bg-bg-hover/60",
              )}
            >
              <MessageSquare className="h-4 w-4 shrink-0 text-text-faint" />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-sm font-medium">{conv.title}</span>
                <span className="text-xs text-text-faint">
                  {formatRelativeTime(conv.updated_at)}
                </span>
              </div>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  void handleDeleteConversation(conv.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.stopPropagation();
                    e.preventDefault();
                    void handleDeleteConversation(conv.id);
                  }
                }}
                className="shrink-0 rounded p-1 text-text-faint opacity-0 transition-opacity hover:text-error group-hover:opacity-100 cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-bg-subtle px-5">
          <div className="flex items-center gap-3">
            <h1 className="text-base font-semibold text-text-bright">Chat</h1>
            {activeAssistant && (
              <span className="rounded-md border border-border bg-bg-elevate px-2 py-0.5 font-mono text-[11px] text-text-faint">
                {activeAssistant.model}
              </span>
            )}
          </div>
          <AssistantSwitcher
            activeId={activeAssistantId}
            onSelect={handleSelectAssistant}
          />
        </header>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin">
          {showEmptyState ? (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-subtle">
                <Sparkles className="h-7 w-7 text-primary" />
              </div>
              <h2 className="text-lg font-semibold text-text-bright">
                {activeAssistant ? activeAssistant.name : "Select an assistant"}
              </h2>
              <p className="mt-1.5 max-w-sm text-sm text-text-faint">
                {activeAssistant
                  ? "Ask a question. Answers are grounded in this assistant's knowledge base."
                  : "Choose an assistant from the dropdown to begin chatting."}
              </p>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl px-6 py-8 space-y-6">
              {messages?.map((msg) => (
                <MessageBubble key={msg.id} role={msg.role} content={msg.content} />
              ))}

              {/* Optimistic user bubble while the turn is in flight */}
              {pendingQuestion && (
                <MessageBubble role="user" content={pendingQuestion} />
              )}

              {/* Streaming assistant bubble */}
              {pendingQuestion && (
                <MessageBubble
                  role="assistant"
                  content={streamedAnswer}
                  streaming={sending && !streamedAnswer}
                />
              )}

              {/* Grounding sources for the completed turn */}
              {lastTurn && lastTurn.citations.length > 0 && (
                <Citations meta={lastTurn} />
              )}

              {error && (
                <div className="flex items-start gap-2 rounded-xl border border-error-border bg-error-subtle px-4 py-3 text-sm text-error animate-slide-down">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Input */}
        <div className="shrink-0 border-t border-border bg-bg-subtle px-6 py-4">
          <div className="mx-auto max-w-3xl">
            <div className="relative flex items-end gap-2 rounded-2xl border border-border bg-bg-input px-4 py-3 transition-colors focus-within:border-primary">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  activeAssistantId
                    ? `Message ${activeAssistant?.name ?? "assistant"}…`
                    : "Select an assistant first…"
                }
                disabled={!activeAssistantId || sending}
                rows={1}
                className="flex-1 resize-none bg-transparent text-sm text-text-bright placeholder:text-text-faint focus:outline-none disabled:opacity-50 max-h-32"
                style={{ minHeight: "24px" }}
              />
              {sending ? (
                <button
                  type="button"
                  onClick={handleStop}
                  title="Stop streaming"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-bg-elevate border border-border text-text-muted transition-colors hover:text-text-bright"
                >
                  <Square className="h-3.5 w-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!input.trim() || !activeAssistantId}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-white transition-colors hover:bg-primary-hover disabled:opacity-40 disabled:pointer-events-none"
                >
                  <Send className="h-4 w-4" />
                </button>
              )}
            </div>
            <p className="mt-2 text-center text-xs text-text-faint">
              Press Enter to send, Shift+Enter for new line
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Sub-components                                                             */
/* ------------------------------------------------------------------------- */

function MessageBubble({
  role,
  content,
  streaming = false,
}: {
  role: "user" | "assistant" | "system";
  content: string;
  streaming?: boolean;
}) {
  const isUser = role === "user";

  return (
    <div
      className={cn(
        "flex gap-4 animate-fade-in",
        isUser ? "flex-row-reverse" : "flex-row",
      )}
    >
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
          isUser ? "bg-bg-elevate" : "bg-primary-subtle",
        )}
      >
        {isUser ? (
          <UserIcon className="h-4 w-4 text-text-muted" />
        ) : (
          <Sparkles className="h-4 w-4 text-primary" />
        )}
      </div>
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
          isUser
            ? "bg-primary text-white rounded-tr-sm"
            : "bg-bg-elevate text-text-bright rounded-tl-sm border border-border",
        )}
      >
        {streaming ? (
          <div className="flex gap-1.5 py-0.5">
            <span
              className="h-2 w-2 rounded-full bg-text-faint animate-bounce-dot"
              style={{ animationDelay: "0ms" }}
            />
            <span
              className="h-2 w-2 rounded-full bg-text-faint animate-bounce-dot"
              style={{ animationDelay: "200ms" }}
            />
            <span
              className="h-2 w-2 rounded-full bg-text-faint animate-bounce-dot"
              style={{ animationDelay: "400ms" }}
            />
          </div>
        ) : (
          <p className="whitespace-pre-wrap">{content}</p>
        )}
      </div>
    </div>
  );
}

/** Which chunks grounded the answer, plus token usage. */
function Citations({ meta }: { meta: TurnMeta }) {
  // One entry per file, keeping its best-scoring chunk.
  const byFile = new Map<string, Citation>();
  for (const citation of meta.citations) {
    const key = citation.file_id ?? citation.filename ?? citation.id;
    const existing = byFile.get(key);
    if (!existing || (citation.score ?? 0) > (existing.score ?? 0)) {
      byFile.set(key, citation);
    }
  }

  return (
    <div className="ml-12 space-y-2 animate-fade-in">
      <div className="flex items-center gap-2 text-xs font-medium text-text-faint">
        <FileText className="h-3.5 w-3.5" />
        Sources
      </div>
      <div className="flex flex-wrap gap-2">
        {[...byFile.values()].map((citation) => (
          <span
            key={citation.id}
            title={
              citation.score !== null
                ? `Relevance ${citation.score.toFixed(3)}`
                : undefined
            }
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg-elevate px-2.5 py-1 text-xs text-text-muted"
          >
            <span className="truncate max-w-[220px]">
              {citation.filename ?? "Unknown source"}
            </span>
            {citation.score !== null && (
              <span className="font-mono text-[10px] text-text-faint">
                {citation.score.toFixed(2)}
              </span>
            )}
          </span>
        ))}
      </div>
      {meta.usage && meta.usage.total_tokens > 0 && (
        <p className="text-[11px] text-text-faint">
          {meta.model} · {meta.usage.prompt_tokens} in / {meta.usage.completion_tokens} out ·{" "}
          {meta.usage.total_tokens} tokens
        </p>
      )}
    </div>
  );
}
