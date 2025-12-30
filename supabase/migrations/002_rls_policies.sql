-- Enable Row Level Security on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE accomplishments ENABLE ROW LEVEL SECURITY;
ALTER TABLE epb_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_api_keys ENABLE ROW LEVEL SECURITY;

-- PROFILES POLICIES

-- Users can view their own profile
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Supervisors can view their subordinates' profiles
CREATE POLICY "Supervisors can view subordinates profiles"
  ON profiles FOR SELECT
  USING (
    id IN (
      SELECT subordinate_id FROM teams WHERE supervisor_id = auth.uid()
    )
  );

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- TEAMS POLICIES

-- Supervisors can view their team relationships
CREATE POLICY "Supervisors can view own team"
  ON teams FOR SELECT
  USING (supervisor_id = auth.uid());

-- Subordinates can view their team relationship
CREATE POLICY "Subordinates can view own team membership"
  ON teams FOR SELECT
  USING (subordinate_id = auth.uid());

-- Supervisors can add subordinates
CREATE POLICY "Supervisors can add subordinates"
  ON teams FOR INSERT
  WITH CHECK (supervisor_id = auth.uid());

-- Supervisors can remove subordinates
CREATE POLICY "Supervisors can remove subordinates"
  ON teams FOR DELETE
  USING (supervisor_id = auth.uid());

-- ACCOMPLISHMENTS POLICIES

-- Users can view their own accomplishments
CREATE POLICY "Users can view own accomplishments"
  ON accomplishments FOR SELECT
  USING (user_id = auth.uid());

-- Supervisors can view their subordinates' accomplishments
CREATE POLICY "Supervisors can view subordinates accomplishments"
  ON accomplishments FOR SELECT
  USING (
    user_id IN (
      SELECT subordinate_id FROM teams WHERE supervisor_id = auth.uid()
    )
  );

-- Users can create accomplishments for themselves
CREATE POLICY "Users can create own accomplishments"
  ON accomplishments FOR INSERT
  WITH CHECK (
    user_id = auth.uid() AND created_by = auth.uid()
  );

-- Supervisors can create accomplishments for subordinates
CREATE POLICY "Supervisors can create subordinates accomplishments"
  ON accomplishments FOR INSERT
  WITH CHECK (
    created_by = auth.uid() AND
    user_id IN (
      SELECT subordinate_id FROM teams WHERE supervisor_id = auth.uid()
    )
  );

-- Users can update their own accomplishments
CREATE POLICY "Users can update own accomplishments"
  ON accomplishments FOR UPDATE
  USING (user_id = auth.uid() AND created_by = auth.uid())
  WITH CHECK (user_id = auth.uid() AND created_by = auth.uid());

-- Supervisors can update accomplishments they created for subordinates
CREATE POLICY "Supervisors can update subordinates accomplishments"
  ON accomplishments FOR UPDATE
  USING (
    created_by = auth.uid() AND
    user_id IN (
      SELECT subordinate_id FROM teams WHERE supervisor_id = auth.uid()
    )
  )
  WITH CHECK (
    created_by = auth.uid() AND
    user_id IN (
      SELECT subordinate_id FROM teams WHERE supervisor_id = auth.uid()
    )
  );

-- Users can delete their own accomplishments
CREATE POLICY "Users can delete own accomplishments"
  ON accomplishments FOR DELETE
  USING (user_id = auth.uid() AND created_by = auth.uid());

-- Supervisors can delete accomplishments they created
CREATE POLICY "Supervisors can delete subordinates accomplishments"
  ON accomplishments FOR DELETE
  USING (
    created_by = auth.uid() AND
    user_id IN (
      SELECT subordinate_id FROM teams WHERE supervisor_id = auth.uid()
    )
  );

-- EPB CONFIG POLICIES

-- Everyone can read EPB config
CREATE POLICY "Anyone can read epb_config"
  ON epb_config FOR SELECT
  USING (true);

-- Only admins can update EPB config
CREATE POLICY "Admins can update epb_config"
  ON epb_config FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- USER API KEYS POLICIES

-- Users can view their own API keys
CREATE POLICY "Users can view own api keys"
  ON user_api_keys FOR SELECT
  USING (user_id = auth.uid());

-- Users can insert their own API keys
CREATE POLICY "Users can insert own api keys"
  ON user_api_keys FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Users can update their own API keys
CREATE POLICY "Users can update own api keys"
  ON user_api_keys FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Users can delete their own API keys
CREATE POLICY "Users can delete own api keys"
  ON user_api_keys FOR DELETE
  USING (user_id = auth.uid());





