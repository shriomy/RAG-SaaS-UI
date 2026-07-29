/*
# RAG System Schema

## Overview
Creates the core tables for a multi-user RAG (Retrieval-Augmented Generation) system.
Users sign in with Supabase auth. Each user owns their own assistants, conversations, messages, and uploaded knowledge files.

## Tables

### assistants
- id: uuid primary key
- user_id: uuid (owner, defaults to auth.uid())
- name: text (assistant name)
- system_prompt: text (LLM system prompt)
- is_active: boolean (whether this assistant is the currently active one)
- created_at, updated_at: timestamps

### conversations
- id: uuid primary key
- user_id: uuid (owner)
- assistant_id: uuid (FK to assistants)
- title: text (auto-generated or user-set)
- created_at, updated_at: timestamps

### messages
- id: uuid primary key
- conversation_id: uuid (FK to conversations)
- user_id: uuid (owner)
- role: text ('user' or 'assistant')
- content: text
- created_at: timestamp

### knowledge_files
- id: uuid primary key
- user_id: uuid (owner)
- assistant_id: uuid (FK to assistants)
- filename: text
- file_type: text (pdf, txt, md)
- storage_path: text (Supabase storage path)
- status: text ('processing', 'indexed', 'failed')
- created_at, updated_at: timestamps

## Security
- RLS enabled on all tables
- Authenticated users can only CRUD their own rows
- Owner columns default to auth.uid()
*/

-- ASSISTANTS
CREATE TABLE IF NOT EXISTS assistants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  system_prompt text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE assistants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_assistants" ON assistants;
CREATE POLICY "select_own_assistants" ON assistants FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_assistants" ON assistants;
CREATE POLICY "insert_own_assistants" ON assistants FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_assistants" ON assistants;
CREATE POLICY "update_own_assistants" ON assistants FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_assistants" ON assistants;
CREATE POLICY "delete_own_assistants" ON assistants FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- CONVERSATIONS
CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  assistant_id uuid REFERENCES assistants(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT 'New Chat',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_conversations" ON conversations;
CREATE POLICY "select_own_conversations" ON conversations FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_conversations" ON conversations;
CREATE POLICY "insert_own_conversations" ON conversations FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_conversations" ON conversations;
CREATE POLICY "update_own_conversations" ON conversations FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_conversations" ON conversations;
CREATE POLICY "delete_own_conversations" ON conversations FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- MESSAGES
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_messages" ON messages;
CREATE POLICY "select_own_messages" ON messages FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_messages" ON messages;
CREATE POLICY "insert_own_messages" ON messages FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_messages" ON messages;
CREATE POLICY "update_own_messages" ON messages FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_messages" ON messages;
CREATE POLICY "delete_own_messages" ON messages FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- KNOWLEDGE FILES
CREATE TABLE IF NOT EXISTS knowledge_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  assistant_id uuid NOT NULL REFERENCES assistants(id) ON DELETE CASCADE,
  filename text NOT NULL,
  file_type text NOT NULL CHECK (file_type IN ('pdf', 'txt', 'md')),
  storage_path text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'indexed', 'failed')),
  file_size bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE knowledge_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_knowledge_files" ON knowledge_files;
CREATE POLICY "select_own_knowledge_files" ON knowledge_files FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_knowledge_files" ON knowledge_files;
CREATE POLICY "insert_own_knowledge_files" ON knowledge_files FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_knowledge_files" ON knowledge_files;
CREATE POLICY "update_own_knowledge_files" ON knowledge_files FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_knowledge_files" ON knowledge_files;
CREATE POLICY "delete_own_knowledge_files" ON knowledge_files FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS conversations_user_id_idx ON conversations(user_id);
CREATE INDEX IF NOT EXISTS conversations_updated_at_idx ON conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS messages_conversation_id_idx ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS messages_created_at_idx ON messages(created_at);
CREATE INDEX IF NOT EXISTS knowledge_files_assistant_id_idx ON knowledge_files(assistant_id);
CREATE INDEX IF NOT EXISTS assistants_user_id_idx ON assistants(user_id);
