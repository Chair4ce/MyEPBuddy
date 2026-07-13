-- Admin reply workflow for user_feedback:
-- status tracking, reply body, and admin-only UPDATE RLS.

ALTER TABLE public.user_feedback
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS admin_reply TEXT,
  ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS replied_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_feedback_status_check'
      AND conrelid = 'public.user_feedback'::regclass
  ) THEN
    ALTER TABLE public.user_feedback
      ADD CONSTRAINT user_feedback_status_check
      CHECK (status IN ('open', 'replied', 'archived'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_feedback_status_created_at
  ON public.user_feedback (status, created_at DESC);

DROP POLICY IF EXISTS "Admins can update feedback" ON public.user_feedback;
CREATE POLICY "Admins can update feedback"
  ON public.user_feedback FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (SELECT auth.uid()) AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (SELECT auth.uid()) AND role = 'admin'
    )
  );
