export type Assistant = {
  id: string;
  user_id: string;
  name: string;
  system_prompt: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

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
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

export type KnowledgeFile = {
  id: string;
  user_id: string;
  assistant_id: string;
  filename: string;
  file_type: "pdf" | "txt" | "md";
  storage_path: string;
  status: "processing" | "indexed" | "failed";
  file_size: number | null;
  created_at: string;
  updated_at: string;
};

export type FileStatus = KnowledgeFile["status"];
