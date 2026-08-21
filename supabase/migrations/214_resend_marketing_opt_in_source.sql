-- Resend webhook (unsubscribe / bounce / complaint) may persist opt-out.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_marketing_email_opt_in_source_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_marketing_email_opt_in_source_check
  CHECK (
    marketing_email_opt_in_source IS NULL
    OR marketing_email_opt_in_source IN (
      'signup',
      'onboarding',
      'settings',
      'resend'
    )
  );
