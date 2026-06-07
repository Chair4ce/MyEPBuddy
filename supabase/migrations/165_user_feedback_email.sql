-- Store submitter email on user_feedback so admins can respond without auth lookups

ALTER TABLE public.user_feedback
  ADD COLUMN IF NOT EXISTS user_email TEXT;

UPDATE public.user_feedback uf
SET user_email = p.email
FROM public.profiles p
WHERE uf.user_id = p.id
  AND uf.user_email IS NULL;

CREATE OR REPLACE FUNCTION public.set_user_feedback_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    SELECT email INTO NEW.user_email
    FROM public.profiles
    WHERE id = NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_user_feedback_email ON public.user_feedback;

CREATE TRIGGER trg_set_user_feedback_email
  BEFORE INSERT ON public.user_feedback
  FOR EACH ROW
  EXECUTE FUNCTION public.set_user_feedback_email();
