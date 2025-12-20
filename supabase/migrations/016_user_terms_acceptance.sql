-- Add terms_accepted_at column to profiles table
-- This tracks when users accepted the data handling terms
ALTER TABLE profiles ADD COLUMN terms_accepted_at TIMESTAMPTZ DEFAULT NULL;

-- Create index for quick lookups on terms acceptance
CREATE INDEX idx_profiles_terms_accepted ON profiles(terms_accepted_at) WHERE terms_accepted_at IS NOT NULL;

-- Update the handle_new_user function to ensure new users have null terms_accepted_at
-- (This is the default, but we're being explicit)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, role, terms_accepted_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url',
    'member',
    NULL
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

