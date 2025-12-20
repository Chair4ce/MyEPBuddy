-- Enable required extensions
-- Note: gen_random_uuid() is built into PostgreSQL 13+ and doesn't require uuid-ossp
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create rank enum type
CREATE TYPE user_rank AS ENUM (
  'AB', 'Amn', 'A1C', 'SrA', 'SSgt', 'TSgt', 'MSgt', 'SMSgt', 'CMSgt'
);

-- Create role enum type
CREATE TYPE user_role AS ENUM ('supervisor', 'subordinate', 'admin');

-- Profiles table
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  rank user_rank,
  afsc TEXT,
  unit TEXT,
  role user_role NOT NULL DEFAULT 'subordinate',
  supervisor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Teams table (supervisor-subordinate relationships)
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supervisor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subordinate_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(supervisor_id, subordinate_id),
  CHECK (supervisor_id != subordinate_id)
);

-- Accomplishments table
CREATE TABLE accomplishments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  action_verb TEXT NOT NULL,
  details TEXT NOT NULL,
  impact TEXT NOT NULL,
  metrics TEXT,
  mpa TEXT NOT NULL,
  tags JSONB DEFAULT '[]'::jsonb,
  cycle_year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- EPB Configuration table (singleton)
CREATE TABLE epb_config (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  max_characters_per_statement INTEGER NOT NULL DEFAULT 350,
  scod_date TEXT NOT NULL DEFAULT '31 Mar',
  current_cycle_year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
  major_graded_areas JSONB NOT NULL DEFAULT '[
    {"key": "executing_mission", "label": "Executing the Mission"},
    {"key": "leading_people", "label": "Leading People"},
    {"key": "managing_resources", "label": "Managing Resources"},
    {"key": "improving_unit", "label": "Improving the Unit"}
  ]'::jsonb,
  style_guidelines TEXT NOT NULL DEFAULT 'Use active voice. Begin with strong action verbs. Quantify impacts with metrics when possible. Keep statements concise and impactful. Avoid jargon and spell out acronyms on first use.',
  rank_verb_progression JSONB NOT NULL DEFAULT '{
    "AB": {"primary": ["Assisted", "Supported", "Contributed"], "secondary": ["Performed", "Executed", "Completed"]},
    "Amn": {"primary": ["Assisted", "Supported", "Performed"], "secondary": ["Executed", "Completed", "Maintained"]},
    "A1C": {"primary": ["Performed", "Executed", "Supported"], "secondary": ["Managed", "Coordinated", "Developed"]},
    "SrA": {"primary": ["Executed", "Coordinated", "Managed"], "secondary": ["Led", "Developed", "Implemented"]},
    "SSgt": {"primary": ["Led", "Managed", "Directed"], "secondary": ["Developed", "Implemented", "Orchestrated"]},
    "TSgt": {"primary": ["Directed", "Orchestrated", "Spearheaded"], "secondary": ["Established", "Transformed", "Pioneered"]},
    "MSgt": {"primary": ["Spearheaded", "Championed", "Architected"], "secondary": ["Transformed", "Revolutionized", "Pioneered"]},
    "SMSgt": {"primary": ["Championed", "Pioneered", "Revolutionized"], "secondary": ["Transformed", "Architected", "Drove"]},
    "CMSgt": {"primary": ["Pioneered", "Revolutionized", "Transformed"], "secondary": ["Championed", "Drove", "Shaped"]}
  }'::jsonb,
  base_system_prompt TEXT NOT NULL DEFAULT 'You are an expert Air Force EPB (Enlisted Performance Brief) writing assistant specializing in creating compliant, impactful narrative statements per AFI 36-2406 (22 Aug 2025).

CRITICAL REQUIREMENTS:
- Each statement MUST be {{max_characters_per_statement}} characters or fewer
- Use rank-appropriate action verbs for {{ratee_rank}} (prefer: {{primary_verbs}})
- Format: Action verb + accomplishment + impact/result with metrics when available
- Plain language only - minimal approved acronyms (AFSC, NCO, etc.)
- 2-3 strong statements per Major Performance Area

STYLE GUIDELINES:
{{style_guidelines}}

Generate statements that are:
1. Specific and quantifiable
2. Action-oriented with measurable impact
3. Appropriate for the ratee''s rank and experience level
4. Ready for direct copy-paste into myEval (pure text only)',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User API Keys table (encrypted storage)
CREATE TABLE user_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  openai_key TEXT,
  anthropic_key TEXT,
  google_key TEXT,
  grok_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_profiles_supervisor ON profiles(supervisor_id);
CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_teams_supervisor ON teams(supervisor_id);
CREATE INDEX idx_teams_subordinate ON teams(subordinate_id);
CREATE INDEX idx_accomplishments_user ON accomplishments(user_id);
CREATE INDEX idx_accomplishments_cycle ON accomplishments(cycle_year);
CREATE INDEX idx_accomplishments_mpa ON accomplishments(mpa);
CREATE INDEX idx_accomplishments_created_by ON accomplishments(created_by);

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_accomplishments_updated_at
  BEFORE UPDATE ON accomplishments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_epb_config_updated_at
  BEFORE UPDATE ON epb_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_api_keys_updated_at
  BEFORE UPDATE ON user_api_keys
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default EPB config
INSERT INTO epb_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Function to handle new user profile creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url',
    'subordinate'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on user signup
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

