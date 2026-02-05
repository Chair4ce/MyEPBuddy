-- Create avatars storage bucket
-- Note: storage schema is created by Supabase storage container
-- This migration handles the case where it may not exist yet (local dev)
DO $$
BEGIN
  -- Only create bucket if storage schema exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'storage' AND table_name = 'buckets'
  ) THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'avatars',
      'avatars',
      true,  -- Public bucket so avatars can be displayed without auth
      2097152,  -- 2MB limit for avatars
      ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- RLS Policies for avatars bucket
-- These are wrapped in DO blocks to handle cases where storage schema doesn't exist yet

-- Allow users to upload their own avatar (INSERT)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'storage' AND table_name = 'objects'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE policyname = 'Users can upload their own avatar' 
      AND tablename = 'objects' AND schemaname = 'storage'
    ) THEN
      CREATE POLICY "Users can upload their own avatar"
      ON storage.objects FOR INSERT
      WITH CHECK (
        bucket_id = 'avatars' 
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
    END IF;
  END IF;
END $$;

-- Allow users to update their own avatar (UPDATE)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'storage' AND table_name = 'objects'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE policyname = 'Users can update their own avatar' 
      AND tablename = 'objects' AND schemaname = 'storage'
    ) THEN
      CREATE POLICY "Users can update their own avatar"
      ON storage.objects FOR UPDATE
      USING (
        bucket_id = 'avatars' 
        AND (storage.foldername(name))[1] = auth.uid()::text
      )
      WITH CHECK (
        bucket_id = 'avatars' 
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
    END IF;
  END IF;
END $$;

-- Allow users to delete their own avatar (DELETE)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'storage' AND table_name = 'objects'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE policyname = 'Users can delete their own avatar' 
      AND tablename = 'objects' AND schemaname = 'storage'
    ) THEN
      CREATE POLICY "Users can delete their own avatar"
      ON storage.objects FOR DELETE
      USING (
        bucket_id = 'avatars' 
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
    END IF;
  END IF;
END $$;

-- Allow public read access to all avatars (SELECT)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'storage' AND table_name = 'objects'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE policyname = 'Avatars are publicly accessible' 
      AND tablename = 'objects' AND schemaname = 'storage'
    ) THEN
      CREATE POLICY "Avatars are publicly accessible"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'avatars');
    END IF;
  END IF;
END $$;




