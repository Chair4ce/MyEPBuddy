-- Backfill avatar_url for existing Google OAuth users
-- Updates profiles where avatar_url is NULL but auth.users has a 'picture' in metadata

UPDATE public.profiles p
SET avatar_url = u.raw_user_meta_data->>'picture'
FROM auth.users u
WHERE p.id = u.id
  AND p.avatar_url IS NULL
  AND u.raw_user_meta_data->>'picture' IS NOT NULL;




