/**
 * Backend API client.
 *
 * Everything that used to hit Supabase directly now goes through the FastAPI
 * backend, because the agent workflow (retrieval, prompt assembly, memory) lives
 * there. Supabase is still used for one thing only: authentication. Its access
 * token is forwarded as a bearer token and the backend verifies it, so the
 * browser never needs elevated database credentials.
 *
 * The one exception is `supabase.auth.*`, which stays client-side — Supabase
 * owns credentials.
 */

import { supabase } from "./supabase";
import type {
  Assistant,
  AssistantConfig,
  ChatEvent,
  Conversation,
  ConversationDetail,
  ConversationMemory,
  KnowledgeFile,
  KnowledgeStats,
  MemorySnapshot,
  Message,
  SyncChatResponse,
  UserMemory,
} from "../types";

const API_URL = (
  import.meta.env.VITE_API_URL ?? "http://localhost:8000"
).replace(/\/+$/, "");

const BASE = `${API_URL}/api/v1`;

/* ------------------------------------------------------------------------- */
/* Errors                                                                     */
/* ------------------------------------------------------------------------- */

/** Mirrors the backend's single error envelope: `{ error: { code, message } }`. */
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function toApiError(response: Response): Promise<ApiError> {
  let code = "http_error";
  let message = `Request failed with status ${response.status}`;
  let details: unknown;

  try {
    const body = await response.json();
    if (body?.error) {
      code = body.error.code ?? code;
      message = body.error.message ?? message;
      details = body.error.details;
    } else if (typeof body?.detail === "string") {
      message = body.detail;
    }
  } catch {
    // Non-JSON body (a proxy error page, say) — keep the generic message.
  }

  if (response.status === 401) {
    message = "Your session has expired. Please sign in again.";
  }
  return new ApiError(code, message, response.status, details);
}

/** Turn a fetch/network failure into something a user can act on. */
function toNetworkError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof DOMException && error.name === "AbortError") {
    return new ApiError("aborted", "Request cancelled.", 0);
  }
  return new ApiError(
    "network_error",
    `Cannot reach the API at ${API_URL}. Is the backend running?`,
    0,
  );
}

/* ------------------------------------------------------------------------- */
/* Request plumbing                                                           */
/* ------------------------------------------------------------------------- */

async function accessToken(): Promise<string> {
  // getSession() refreshes the token when it is close to expiry, so this is the
  // right call to make per request rather than caching a token ourselves.
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new ApiError("unauthorized", error.message, 401);

  const token = data.session?.access_token;
  if (!token) {
    throw new ApiError("unauthorized", "You are not signed in.", 401);
  }
  return token;
}

async function request<T>(
  path: string,
  init: RequestInit & { query?: Record<string, string | number | undefined> } = {},
): Promise<T> {
  const { query, headers, ...rest } = init;

  const url = new URL(`${BASE}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const token = await accessToken();

  let response: Response;
  try {
    response = await fetch(url, {
      ...rest,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(rest.body instanceof FormData
          ? {} // let the browser set the multipart boundary
          : { "Content-Type": "application/json" }),
        ...headers,
      },
    });
  } catch (error) {
    throw toNetworkError(error);
  }

  if (!response.ok) throw await toApiError(response);

  if (response.status === 204 || response.headers.get("content-length") === "0") {
    return undefined as T;
  }
  return (await response.json()) as T;
}

const json = (body: unknown) => JSON.stringify(body);

/* ------------------------------------------------------------------------- */
/* Assistants                                                                 */
/* ------------------------------------------------------------------------- */

export type AssistantPatch = Partial<{
  name: string;
  system_prompt: string;
  model: string;
  temperature: number;
  max_tokens: number;
  is_active: boolean;
  config: AssistantConfig;
}>;

export const assistantsApi = {
  list: () => request<Assistant[]>("/assistants"),

  get: (id: string) => request<Assistant>(`/assistants/${id}`),

  create: (payload: { name: string; system_prompt?: string; model?: string }) =>
    request<Assistant>("/assistants", { method: "POST", body: json(payload) }),

  update: (id: string, patch: AssistantPatch) =>
    request<Assistant>(`/assistants/${id}`, { method: "PATCH", body: json(patch) }),

  /** Activates one assistant and deactivates the rest, server-side. */
  activate: (id: string) =>
    request<Assistant>(`/assistants/${id}/activate`, { method: "POST" }),

  /** Also purges the assistant's vectors and storage blobs. */
  remove: (id: string) =>
    request<{ message: string }>(`/assistants/${id}`, { method: "DELETE" }),
};

/* ------------------------------------------------------------------------- */
/* Knowledge                                                                  */
/* ------------------------------------------------------------------------- */

export const knowledgeApi = {
  list: (assistantId: string) =>
    request<KnowledgeFile[]>("/knowledge", { query: { assistant_id: assistantId } }),

  stats: (assistantId: string) =>
    request<KnowledgeStats>("/knowledge/stats", {
      query: { assistant_id: assistantId },
    }),

  /**
   * Uploads through the backend, which stores the blob, registers the row and
   * kicks off indexing (load → split → embed → upsert) in the background. The
   * returned row is `status: "processing"`; poll the list until it settles.
   */
  upload: (assistantId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<KnowledgeFile>("/knowledge/upload", {
      method: "POST",
      query: { assistant_id: assistantId },
      body: form,
    });
  },

  /** Re-runs indexing synchronously and returns the file's final state. */
  reindex: (fileId: string) =>
    request<KnowledgeFile>(`/knowledge/${fileId}/reindex`, { method: "POST" }),

  /** Removes the metadata row, the storage blob and the vectors. */
  remove: (fileId: string) =>
    request<{ message: string }>(`/knowledge/${fileId}`, { method: "DELETE" }),

  downloadUrl: (fileId: string) =>
    request<{ url: string; expires_in: number }>(
      `/knowledge/${fileId}/download-url`,
    ),
};

/* ------------------------------------------------------------------------- */
/* Conversations                                                              */
/* ------------------------------------------------------------------------- */

export const conversationsApi = {
  list: (assistantId?: string) =>
    request<Conversation[]>("/conversations", {
      query: { assistant_id: assistantId, limit: 100 },
    }),

  get: (id: string) => request<ConversationDetail>(`/conversations/${id}`),

  messages: (id: string) => request<Message[]>(`/conversations/${id}/messages`),

  create: (payload: { assistant_id?: string; title?: string }) =>
    request<Conversation>("/conversations", { method: "POST", body: json(payload) }),

  rename: (id: string, title: string) =>
    request<Conversation>(`/conversations/${id}`, {
      method: "PATCH",
      body: json({ title }),
    }),

  /** Cascades to messages and conversation memory. */
  remove: (id: string) =>
    request<{ message: string }>(`/conversations/${id}`, { method: "DELETE" }),
};

/* ------------------------------------------------------------------------- */
/* Memory                                                                     */
/* ------------------------------------------------------------------------- */

export const memoryApi = {
  getUser: () => request<UserMemory>("/memory/user"),

  setUser: (summary: string) =>
    request<UserMemory>("/memory/user", { method: "PUT", body: json({ summary }) }),

  clearUser: () =>
    request<{ message: string }>("/memory/user", { method: "DELETE" }),

  getConversation: (conversationId: string) =>
    request<ConversationMemory>(`/memory/conversations/${conversationId}`),

  setConversation: (conversationId: string, summary: string) =>
    request<ConversationMemory>(`/memory/conversations/${conversationId}`, {
      method: "PUT",
      body: json({ summary }),
    }),

  clearConversation: (conversationId: string) =>
    request<{ message: string }>(`/memory/conversations/${conversationId}`, {
      method: "DELETE",
    }),

  /** Exactly what the agent will load as memory on the next turn. */
  snapshot: (conversationId: string) =>
    request<MemorySnapshot>("/memory/snapshot", {
      query: { conversation_id: conversationId },
    }),
};

/* ------------------------------------------------------------------------- */
/* Chat                                                                       */
/* ------------------------------------------------------------------------- */

export type ChatRequest = {
  question: string;
  /** Omit to use the user's active assistant. */
  assistant_id?: string | null;
  /** Omit to start a new conversation; read the new id from the `start` event. */
  conversation_id?: string | null;
};

/**
 * Runs the agent graph and yields Server-Sent Events as they arrive.
 *
 * Frames are `data: <json>` separated by a blank line, terminated by
 * `data: [DONE]`. A partial frame can straddle two network chunks, so the tail
 * of the buffer is carried over rather than parsed.
 *
 * Note: aborting via `signal` stops *reading*. The backend deliberately lets the
 * run finish so the exchange is still saved — refetch messages afterwards to
 * pick up the complete answer.
 */
export async function* streamChat(
  body: ChatRequest,
  signal?: AbortSignal,
): AsyncGenerator<ChatEvent> {
  const token = await accessToken();

  let response: Response;
  try {
    response = await fetch(`${BASE}/chat`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: json(body),
      signal,
    });
  } catch (error) {
    throw toNetworkError(error);
  }

  if (!response.ok) throw await toApiError(response);
  if (!response.body) {
    throw new ApiError("stream_error", "The server returned no stream body.", 500);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  /** Parse one `data:` frame; returns null for the terminator or a blank frame. */
  function parseFrame(frame: string): ChatEvent | null {
    for (const line of frame.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") return null;
      try {
        return JSON.parse(payload) as ChatEvent;
      } catch {
        return null; // never let one malformed frame kill the stream
      }
    }
    return null;
  }

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? ""; // last element may be incomplete

      for (const frame of frames) {
        const event = parseFrame(frame);
        if (event) yield event;
      }
    }

    // A final frame with no trailing blank line.
    const tail = parseFrame(buffer);
    if (tail) yield tail;
  } finally {
    reader.releaseLock();
  }
}

/** Same graph, single JSON response. Handy for debugging without streaming. */
export const chatApi = {
  sync: (body: ChatRequest) =>
    request<SyncChatResponse>("/chat/sync", { method: "POST", body: json(body) }),
};

/* ------------------------------------------------------------------------- */
/* Diagnostics                                                                */
/* ------------------------------------------------------------------------- */

export type ReadyResponse = {
  status: string;
  version: string;
  dependencies: Record<string, string>;
  config: Record<string, unknown>;
};

/** Unauthenticated: usable to show "backend offline" before sign-in. */
export async function fetchReadiness(): Promise<ReadyResponse> {
  try {
    const response = await fetch(`${API_URL}/ready`);
    if (!response.ok) throw await toApiError(response);
    return (await response.json()) as ReadyResponse;
  } catch (error) {
    throw toNetworkError(error);
  }
}

export { API_URL };
