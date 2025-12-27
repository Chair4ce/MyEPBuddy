-- Add max_example_statements setting to user_llm_settings
-- This allows users to control how many crowdsourced examples are included in prompts
-- to manage LLM token costs

ALTER TABLE user_llm_settings 
ADD COLUMN max_example_statements INT NOT NULL DEFAULT 6;

-- Add a comment explaining the column
COMMENT ON COLUMN user_llm_settings.max_example_statements IS 
  'Maximum number of example statements to include in the generation prompt (0-20). Higher values provide more context but increase token usage.';



