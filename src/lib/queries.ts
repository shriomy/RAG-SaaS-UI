import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase";
import type { Assistant, KnowledgeFile } from "../types";

export function useAssistants() {
  return useQuery({
    queryKey: ["assistants"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assistants")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as Assistant[];
    },
  });
}

export function useAssistant(id: string | undefined) {
  return useQuery({
    queryKey: ["assistant", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("assistants")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as Assistant | null;
    },
    enabled: !!id,
  });
}

export function useKnowledgeFiles(assistantId: string | undefined) {
  return useQuery({
    queryKey: ["knowledge-files", assistantId],
    queryFn: async () => {
      if (!assistantId) return [];
      const { data, error } = await supabase
        .from("knowledge_files")
        .select("*")
        .eq("assistant_id", assistantId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as KnowledgeFile[];
    },
    enabled: !!assistantId,
  });
}

export async function createAssistant(name: string): Promise<Assistant> {
  const { data, error } = await supabase
    .from("assistants")
    .insert({ name })
    .select()
    .single();
  if (error) throw error;
  return data as Assistant;
}

export async function updateAssistant(
  id: string,
  patch: Partial<Pick<Assistant, "name" | "system_prompt" | "is_active">>,
): Promise<void> {
  const { error } = await supabase.from("assistants").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteAssistant(id: string): Promise<void> {
  const { error } = await supabase.from("assistants").delete().eq("id", id);
  if (error) throw error;
}

export async function setActiveAssistant(id: string): Promise<void> {
  // Deactivate all, then activate the chosen one
  const { data: all, error: fetchErr } = await supabase
    .from("assistants")
    .select("id");
  if (fetchErr) throw fetchErr;
  for (const a of all ?? []) {
    if (a.id !== id) {
      await supabase.from("assistants").update({ is_active: false }).eq("id", a.id);
    }
  }
  const { error } = await supabase
    .from("assistants")
    .update({ is_active: true })
    .eq("id", id);
  if (error) throw error;
}
