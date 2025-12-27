-- User LLM Settings: Personal configuration for statement generation
CREATE TABLE user_llm_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  
  -- Statement configuration
  max_characters_per_statement INT NOT NULL DEFAULT 350,
  scod_date TEXT NOT NULL DEFAULT '31 March',
  current_cycle_year INT NOT NULL DEFAULT 2025,
  
  -- Major Performance Areas (JSON array)
  major_graded_areas JSONB NOT NULL DEFAULT '[
    {"key": "executing_mission", "label": "Executing the Mission"},
    {"key": "leading_people", "label": "Leading People"},
    {"key": "managing_resources", "label": "Managing Resources"},
    {"key": "improving_unit", "label": "Improving the Unit"}
  ]'::jsonb,
  
  -- Rank-specific action verbs (JSON object)
  rank_verb_progression JSONB NOT NULL DEFAULT '{
    "AB": {"primary": ["Assisted", "Supported", "Performed"], "secondary": ["Helped", "Contributed", "Participated"]},
    "Amn": {"primary": ["Assisted", "Supported", "Performed"], "secondary": ["Helped", "Contributed", "Executed"]},
    "A1C": {"primary": ["Executed", "Performed", "Supported"], "secondary": ["Assisted", "Contributed", "Maintained"]},
    "SrA": {"primary": ["Executed", "Coordinated", "Managed"], "secondary": ["Led", "Supervised", "Trained"]},
    "SSgt": {"primary": ["Led", "Managed", "Directed"], "secondary": ["Supervised", "Coordinated", "Developed"]},
    "TSgt": {"primary": ["Led", "Managed", "Directed"], "secondary": ["Spearheaded", "Orchestrated", "Championed"]},
    "MSgt": {"primary": ["Directed", "Spearheaded", "Orchestrated"], "secondary": ["Championed", "Transformed", "Pioneered"]},
    "SMSgt": {"primary": ["Spearheaded", "Orchestrated", "Championed"], "secondary": ["Transformed", "Pioneered", "Revolutionized"]},
    "CMSgt": {"primary": ["Championed", "Transformed", "Pioneered"], "secondary": ["Revolutionized", "Institutionalized", "Shaped"]}
  }'::jsonb,
  
  -- Style guidelines
  style_guidelines TEXT NOT NULL DEFAULT 'Write in active voice. Use strong action verbs. Include quantifiable metrics when possible. Focus on impact and results. Avoid personal pronouns. Keep statements concise and impactful.',
  
  -- Custom system prompt with placeholders
  base_system_prompt TEXT NOT NULL DEFAULT 'You are an expert Air Force EPB (Enlisted Performance Brief) writer with deep knowledge of AFI 36-2406. Your task is to generate professional, compliant narrative statements.

## Key Requirements
- Each statement MUST be {{max_characters_per_statement}} characters or fewer
- Use rank-appropriate action verbs for {{ratee_rank}}: {{primary_verbs}}
- Generate 2-3 strong statements per Major Performance Area
- Follow the Action-Impact-Result format
- Include metrics and quantifiable achievements when available
- Write in third person, active voice
- Use only approved acronyms from the provided list

## Style Guidelines
{{style_guidelines}}

## Approved Acronyms
Only use acronyms from this list. Spell out all other terms:
{{acronyms_list}}',

  -- Acronyms list (JSON array of {acronym, definition})
  acronyms JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE user_llm_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own LLM settings"
  ON user_llm_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own LLM settings"
  ON user_llm_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own LLM settings"
  ON user_llm_settings FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Index
CREATE INDEX idx_user_llm_settings_user ON user_llm_settings(user_id);

-- Update trigger
CREATE TRIGGER update_user_llm_settings_updated_at
  BEFORE UPDATE ON user_llm_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();



