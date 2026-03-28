-- Add clarifying_answers JSONB column to award_shell_sections
-- Stores user's answers to LLM-generated follow-up questions for persistent context
-- Format: [{"question": "...", "category": "impact|scope|...", "answer": "..."}]
ALTER TABLE award_shell_sections
ADD COLUMN clarifying_answers JSONB NOT NULL DEFAULT '[]'::jsonb;
