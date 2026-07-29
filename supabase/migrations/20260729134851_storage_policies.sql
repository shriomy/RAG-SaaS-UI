/*
# Storage policies for knowledge_files bucket

## Overview
Creates RLS policies for the `knowledge_files` storage bucket so authenticated users can upload, read, and delete their own knowledge files. Files are scoped per-user via the folder path `user_id/...`.

## Security
- SELECT/INSERT/UPDATE/DELETE scoped to authenticated users
- Object paths must start with the user's own id
*/

DROP POLICY IF EXISTS "read_own_knowledge_files" ON storage.objects;
CREATE POLICY "read_own_knowledge_files" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'knowledge_files' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "insert_own_knowledge_files" ON storage.objects;
CREATE POLICY "insert_own_knowledge_files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'knowledge_files' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "update_own_knowledge_files" ON storage.objects;
CREATE POLICY "update_own_knowledge_files" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'knowledge_files' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'knowledge_files' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "delete_own_knowledge_files" ON storage.objects;
CREATE POLICY "delete_own_knowledge_files" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'knowledge_files' AND (storage.foldername(name))[1] = auth.uid()::text);
