/**
 * Shapes returned by the backend API (see RAG-System-API/app/schemas).
 * Field names mirror the server exactly so responses need no remapping.
 */

/* ------------------------------------------------------------------------- */
/* Assistants                                                                 */
/* ------------------------------------------------------------------------- */

/**
 * Per-assistant overrides, stored as JSONB. This is the forward-compatibility
 * slot: retrieval tuning, tool allow-lists and MCP server selection all live
 * here, so adding them needs no migration and no frontend type change.
 */
export type AssistantConfig = {
  llm?: {
    temperature?: number;
    max_tokens?: number;
    /** Passed to OpenRouter verbatim — provider routing, reasoning effort, etc. */
    extra_body?: Record<string, unknown>;
  };
  retrieval?: {
    top_k?: number;
    candidate_k?: number;
    score_threshold?: number | null;
    reranker?: string;
    sources?: string[];
  };
  tools?: string[];
  mcp_servers?: string[];
};

export type Assistant = {
  id: string;
  user_id: string;
  name: string;
  system_prompt: string;
  is_active: boolean;
  /** OpenRouter model slug. Changing this switches models — no deploy needed. */
  model: string;
  temperature: number;
  max_tokens: number;
  config: AssistantConfig;
  created_at: string;
  updated_at: string;
};

/* ------------------------------------------------------------------------- */
/* Conversations and messages                                                 */
/* ------------------------------------------------------------------------- */

export type Conversation = {
  id: string;
  user_id: string;
  assistant_id: string | null;
  title: string;
  created_at: string;
  updated_at: string;
};

export type Message = {
  id: string;
  conversation_id: string;
  user_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
};

export type ConversationDetail = {
  conversation: Conversation;
  messages: Message[];
  message_count: number;
};

/* ------------------------------------------------------------------------- */
/* Knowledge base                                                             */
/* ------------------------------------------------------------------------- */

export type KnowledgeFile = {
  id: string;
  user_id: string;
  assistant_id: string;
  filename: string;
  file_type: "pdf" | "txt" | "md";
  storage_path: string;
  status: FileStatus;
  file_size: number | null;
  /** Chunks written to the vector store. 0 until indexing completes. */
  chunk_count: number;
  /** Populated when `status === "failed"` — says why ingestion did not finish. */
  error_message: string | null;
  indexed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type FileStatus = "processing" | "indexed" | "failed";

export type KnowledgeStats = {
  total_files: number;
  indexed: number;
  processing: number;
  failed: number;
  total_chunks: number;
  total_bytes: number;
  /** Points actually in Qdrant — the authoritative count for retrieval. */
  vector_count: number;
};

/* ------------------------------------------------------------------------- */
/* Long-term memory                                                           */
/* ------------------------------------------------------------------------- */

export type UserMemory = {
  user_id: string;
  summary: string;
  turn_count: number;
  updated_at: string | null;
};

export type ConversationMemory = {
  conversation_id: string;
  user_id: string;
  summary: string;
  message_count: number;
  updated_at: string | null;
};

export type MemorySnapshot = {
  user_summary: string;
  conversation_summary: string;
  recent_messages: { role: string; content: string }[];
  recent_message_limit: number;
};

/* ------------------------------------------------------------------------- */
/* Chat                                                                       */
/* ------------------------------------------------------------------------- */

/** Which knowledge chunk grounded part of an answer. */
export type Citation = {
  id: string;
  source: string;
  filename: string | null;
  file_id: string | null;
  chunk_index: number | null;
  score: number | null;
};

export type TokenUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};

/* SSE event union emitted by POST /api/v1/chat. */

export type ChatStartEvent = {
  type: "start";
  conversation_id: string;
  assistant_id: string;
  model: string;
  is_new_conversation: boolean;
};

export type ChatTokenEvent = {
  type: "token";
  content: string;
};

/** A guardrail rewrote the answer: replace what was rendered from tokens. */
export type ChatRevisionEvent = {
  type: "revision";
  content: string;
};

export type ChatDoneEvent = {
  type: "done";
  answer: string;
  conversation_id: string;
  user_message_id: string | null;
  assistant_message_id: string | null;
  citations: Citation[];
  usage: TokenUsage | null;
  model: string | null;
  /** Present when the conversation was auto-titled on its first turn. */
  title?: string | null;
  /** Non-fatal problem, e.g. the answer streamed but could not be saved. */
  warning?: string | null;
};

export type ChatErrorEvent = {
  type: "error";
  code: string;
  message: string;
};

export type ChatEvent =
  | ChatStartEvent
  | ChatTokenEvent
  | ChatRevisionEvent
  | ChatDoneEvent
  | ChatErrorEvent;

export type SyncChatResponse = {
  answer: string;
  conversation_id: string;
  user_message_id: string | null;
  assistant_message_id: string | null;
  citations: Citation[];
  usage: TokenUsage | null;
  model: string | null;
};
