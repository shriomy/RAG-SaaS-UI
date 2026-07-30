/**
 * React Query hooks and mutations, backed by the FastAPI API.
 *
 * Previously these talked to Supabase directly. They now go through the backend
 * so that server-side concerns — vector cleanup on delete, ingestion, the
 * active-assistant invariant — happen in one place instead of being
 * re-implemented in the browser.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  assistantsApi,
  conversationsApi,
  knowledgeApi,
  memoryApi,
  type AssistantPatch,
} from "./api";
import type { Assistant, KnowledgeFile } from "../types";

/* ------------------------------------------------------------------------- */
/* Query keys                                                                 */
/* ------------------------------------------------------------------------- */

export const queryKeys = {
  assistants: ["assistants"] as const,
  assistant: (id: string | undefined) => ["assistant", id] as const,
  knowledgeFiles: (assistantId: string | undefined) =>
    ["knowledge-files", assistantId] as const,
  knowledgeStats: (assistantId: string | undefined) =>
    ["knowledge-stats", assistantId] as const,
  conversations: (assistantId: string | null | undefined) =>
    ["conversations", assistantId] as const,
  messages: (conversationId: string | null | undefined) =>
    ["messages", conversationId] as const,
  userMemory: ["user-memory"] as const,
  conversationMemory: (conversationId: string | null | undefined) =>
    ["conversation-memory", conversationId] as const,
};

/* ------------------------------------------------------------------------- */
/* Assistants                                                                 */
/* ------------------------------------------------------------------------- */

export function useAssistants() {
  return useQuery({
    queryKey: queryKeys.assistants,
    queryFn: () => assistantsApi.list(),
    staleTime: 30_000,
  });
}

export function useAssistant(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.assistant(id),
    queryFn: () => (id ? assistantsApi.get(id) : null),
    enabled: !!id,
  });
}

export async function createAssistant(name: string): Promise<Assistant> {
  return assistantsApi.create({ name });
}

export async function updateAssistant(
  id: string,
  patch: AssistantPatch,
): Promise<Assistant> {
  return assistantsApi.update(id, patch);
}

export async function deleteAssistant(id: string): Promise<void> {
  // The backend also purges this assistant's vectors and storage blobs.
  await assistantsApi.remove(id);
}

export async function setActiveAssistant(id: string): Promise<void> {
  // One call: the backend deactivates the others atomically enough for our
  // purposes, rather than the browser looping over every row.
  await assistantsApi.activate(id);
}

/* ------------------------------------------------------------------------- */
/* Knowledge base                                                             */
/* ------------------------------------------------------------------------- */

/**
 * Ingestion runs in the background, so this polls while anything is still
 * processing and stops once every file has settled.
 */
export function useKnowledgeFiles(assistantId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.knowledgeFiles(assistantId),
    queryFn: () => (assistantId ? knowledgeApi.list(assistantId) : []),
    enabled: !!assistantId,
    refetchInterval: (query) => {
      const files = query.state.data as KnowledgeFile[] | undefined;
      const pending = files?.some((file) => file.status === "processing");
      return pending ? 2_000 : false;
    },
  });
}

export function useKnowledgeStats(assistantId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.knowledgeStats(assistantId),
    queryFn: () => (assistantId ? knowledgeApi.stats(assistantId) : null),
    enabled: !!assistantId,
  });
}

export async function uploadKnowledgeFile(
  assistantId: string,
  file: File,
): Promise<KnowledgeFile> {
  return knowledgeApi.upload(assistantId, file);
}

export async function reindexKnowledgeFile(fileId: string): Promise<KnowledgeFile> {
  return knowledgeApi.reindex(fileId);
}

export async function deleteKnowledgeFile(fileId: string): Promise<void> {
  // Removes the row, the storage blob and the vectors in one call.
  await knowledgeApi.remove(fileId);
}

/* ------------------------------------------------------------------------- */
/* Conversations                                                              */
/* ------------------------------------------------------------------------- */

export function useConversations(assistantId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.conversations(assistantId),
    queryFn: () => conversationsApi.list(assistantId ?? undefined),
    enabled: !!assistantId,
  });
}

export function useMessages(conversationId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.messages(conversationId),
    queryFn: () => (conversationId ? conversationsApi.messages(conversationId) : []),
    enabled: !!conversationId,
  });
}

export async function deleteConversation(id: string): Promise<void> {
  await conversationsApi.remove(id);
}

export async function renameConversation(id: string, title: string): Promise<void> {
  await conversationsApi.rename(id, title);
}

/* ------------------------------------------------------------------------- */
/* Memory                                                                     */
/* ------------------------------------------------------------------------- */

export function useUserMemory() {
  return useQuery({
    queryKey: queryKeys.userMemory,
    queryFn: () => memoryApi.getUser(),
  });
}

export function useConversationMemory(conversationId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.conversationMemory(conversationId),
    queryFn: () =>
      conversationId ? memoryApi.getConversation(conversationId) : null,
    enabled: !!conversationId,
  });
}

export async function updateUserMemory(summary: string): Promise<void> {
  await memoryApi.setUser(summary);
}

export async function clearUserMemory(): Promise<void> {
  await memoryApi.clearUser();
}

/* ------------------------------------------------------------------------- */
/* Invalidation helper                                                        */
/* ------------------------------------------------------------------------- */

/**
 * After a chat turn the server has written messages, possibly created and titled
 * a conversation, and refreshed memory. Rather than have each caller remember
 * that list, refresh it in one place.
 */
export function useRefreshAfterChat() {
  const queryClient = useQueryClient();

  return async (conversationId: string, assistantId: string | null) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.messages(conversationId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations(assistantId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.userMemory }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversationMemory(conversationId),
      }),
    ]);
  };
}
