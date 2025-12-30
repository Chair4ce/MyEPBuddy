-- Add duty_description field to epb_shells table
-- This allows users to describe their duty position/responsibilities (max 450 characters)
-- Used as context for AI when generating/assessing EPB statements

-- Add the duty_description column
ALTER TABLE epb_shells
ADD COLUMN IF NOT EXISTS duty_description TEXT DEFAULT '';

-- Add a check constraint to enforce the 450 character limit
ALTER TABLE epb_shells
ADD CONSTRAINT duty_description_max_length CHECK (char_length(duty_description) <= 450);

-- Add a comment describing the field
COMMENT ON COLUMN epb_shells.duty_description IS 'Description of the member''s duty position and responsibilities (max 450 chars). Used as context for AI statement generation.';

