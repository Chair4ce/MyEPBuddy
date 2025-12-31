-- Add completion status for duty description
ALTER TABLE epb_shells
  ADD COLUMN IF NOT EXISTS duty_description_complete BOOLEAN NOT NULL DEFAULT FALSE;

