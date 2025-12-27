-- Add lines_per_statement column to award_shell_sections
-- This allows each statement within a category to have its own line count setting

ALTER TABLE award_shell_sections
ADD COLUMN lines_per_statement smallint NOT NULL DEFAULT 2
CHECK (lines_per_statement IN (2, 3));

COMMENT ON COLUMN award_shell_sections.lines_per_statement IS 'Number of lines per statement (2 or 3) for AI generation';


