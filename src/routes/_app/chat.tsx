import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Send,
  Plus,
  MessageSquare,
  Trash2,
  Sparkles,
  User as UserIcon,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { useAssistants, setActiveAssistant } from "../../lib/queries";
import { AssistantSwitcher } from "../../components/AssistantSwitcher";
import { Button } from "../../components/Button";
import { cn, formatRelativeTime } from "../../lib/utils";
import type { Conversation, Message } from "../../types";

export const Route = createFileRoute("/_app/chat")({
  component: ChatPage,
});

function ChatPage() {
  const queryClient = useQueryClient();
  const { data: assistants } = useAssistants();

  const [activeAssistantId, setActiveAssistantId] = useState<string | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Initialize active assistant
  useEffect(() => {
    if (assistants && assistants.length > 0 && !activeAssistantId) {
      const active = assistants.find((a) => a.is_active) ?? assistants[0]!;
      setActiveAssistantId(active.id);
    }
  }, [assistants, activeAssistantId]);

  const { data: conversations } = useQuery({
    queryKey: ["conversations", activeAssistantId],
    queryFn: async () => {
      if (!activeAssistantId) return [];
      const { data, error } = await supabase
        .from("conversations")
        .select("*")
        .eq("assistant_id", activeAssistantId)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data as Conversation[];
    },
    enabled: !!activeAssistantId,
  });

  const { data: messages } = useQuery({
    queryKey: ["messages", activeConversationId],
    queryFn: async () => {
      if (!activeConversationId) return [];
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", activeConversationId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as Message[];
    },
    enabled: !!activeConversationId,
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  async function handleSelectAssistant(id: string) {
    setActiveAssistantId(id);
    setActiveConversationId(null);
    await setActiveAssistant(id);
    await queryClient.invalidateQueries({ queryKey: ["assistants"] });
  }

  async function handleNewChat() {
    if (!activeAssistantId) return;
    const title = `Chat ${new Date().toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })}`;
    const { data, error } = await supabase
      .from("conversations")
      .insert({ assistant_id: activeAssistantId, title })
      .select()
      .single();
    if (error) {
      console.error(error);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["conversations", activeAssistantId] });
    setActiveConversationId((data as Conversation).id);
  }

  async function handleDeleteConversation(id: string) {
    const { error } = await supabase.from("conversations").delete().eq("id", id);
    if (error) {
      console.error(error);
      return;
    }
    if (activeConversationId === id) setActiveConversationId(null);
    await queryClient.invalidateQueries({ queryKey: ["conversations", activeAssistantId] });
  }

  async function handleSend() {
    const content = input.trim();
    if (!content || !activeAssistantId || sending) return;

    let conversationId = activeConversationId;

    // Create conversation if none selected
    if (!conversationId) {
      const { data: conv, error: convErr } = await supabase
        .from("conversations")
        .insert({
          assistant_id: activeAssistantId,
          title: content.slice(0, 40),
        })
        .select()
        .single();
      if (convErr) {
        console.error(convErr);
        return;
      }
      conversationId = (conv as Conversation).id;
      setActiveConversationId(conversationId);
      await queryClient.invalidateQueries({ queryKey: ["conversations", activeAssistantId] });
    }

    setSending(true);
    setInput("");

    // Insert user message
    const { error: msgErr } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      role: "user",
      content,
    });
    if (msgErr) {
      console.error(msgErr);
      setSending(false);
      return;
    }

    await queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });

    // Simulate assistant response (RAG backend would be wired here)
    await new Promise((r) => setTimeout(r, 800));
    const assistantName =
      assistants?.find((a) => a.id === activeAssistantId)?.name ?? "Assistant";
    const response = `This is a simulated response from ${assistantName}. In a production RAG system, this would query your knowledge base using the uploaded documents and the assistant's system prompt to generate a grounded answer.\n\nYour message was: "${content}"`;

    const { error: respErr } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      role: "assistant",
      content: response,
    });
    if (respErr) console.error(respErr);

    await queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
    setSending(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  const activeAssistant = assistants?.find((a) => a.id === activeAssistantId);

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
              onClick={() => setActiveConversationId(conv.id)}
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
        {/* Header with assistant switcher */}
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-bg-subtle px-5">
          <div className="flex items-center gap-3">
            <h1 className="text-base font-semibold text-text-bright">Chat</h1>
          </div>
          <AssistantSwitcher
            activeId={activeAssistantId}
            onSelect={handleSelectAssistant}
          />
        </header>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin">
          {!activeConversationId || messages?.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-subtle">
                <Sparkles className="h-7 w-7 text-primary" />
              </div>
              <h2 className="text-lg font-semibold text-text-bright">
                {activeAssistant ? activeAssistant.name : "Select an assistant"}
              </h2>
              <p className="mt-1.5 max-w-sm text-sm text-text-faint">
                {activeAssistant
                  ? "Start a conversation by typing a message below."
                  : "Choose an assistant from the dropdown to begin chatting."}
              </p>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl px-6 py-8 space-y-6">
              {messages?.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    "flex gap-4 animate-fade-in",
                    msg.role === "user" ? "flex-row-reverse" : "flex-row",
                  )}
                >
                  <div
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                      msg.role === "user"
                        ? "bg-bg-elevate"
                        : "bg-primary-subtle",
                    )}
                  >
                    {msg.role === "user" ? (
                      <UserIcon className="h-4 w-4 text-text-muted" />
                    ) : (
                      <Sparkles className="h-4 w-4 text-primary" />
                    )}
                  </div>
                  <div
                    className={cn(
                      "max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
                      msg.role === "user"
                        ? "bg-primary text-white rounded-tr-sm"
                        : "bg-bg-elevate text-text-bright rounded-tl-sm border border-border",
                    )}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </div>
              ))}
              {sending && (
                <div className="flex gap-4 animate-fade-in">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-subtle">
                    <Sparkles className="h-4 w-4 text-primary" />
                  </div>
                  <div className="rounded-2xl rounded-tl-sm border border-border bg-bg-elevate px-4 py-3">
                    <div className="flex gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-text-faint animate-bounce-dot" style={{ animationDelay: "0ms" }} />
                      <span className="h-2 w-2 rounded-full bg-text-faint animate-bounce-dot" style={{ animationDelay: "200ms" }} />
                      <span className="h-2 w-2 rounded-full bg-text-faint animate-bounce-dot" style={{ animationDelay: "400ms" }} />
                    </div>
                  </div>
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
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  activeAssistantId
                    ? `Message ${activeAssistant?.name ?? "assistant"}…`
                    : "Select an assistant first…"
                }
                disabled={!activeAssistantId}
                rows={1}
                className="flex-1 resize-none bg-transparent text-sm text-text-bright placeholder:text-text-faint focus:outline-none disabled:opacity-50 max-h-32"
                style={{ minHeight: "24px" }}
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={!input.trim() || sending || !activeAssistantId}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-white transition-colors hover:bg-primary-hover disabled:opacity-40 disabled:pointer-events-none"
              >
                <Send className="h-4 w-4" />
              </button>
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
