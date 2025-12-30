-- Migration: Awards and Recognition System
-- Tracks coins, quarterly/annual awards, and special recognitions for team members

-- Award type enum
CREATE TYPE award_type AS ENUM (
  'coin',
  'quarterly',
  'annual',
  'special'
);

-- Award level (for competitive awards)
CREATE TYPE award_level AS ENUM (
  'squadron',
  'group',
  'wing',
  'majcom',
  'haf' -- Headquarters Air Force
);

-- Award category (for competitive awards)
CREATE TYPE award_category AS ENUM (
  'snco',      -- Senior NCO
  'nco',       -- NCO
  'amn',       -- Airman
  'jr_tech',   -- Junior Technician
  'sr_tech',   -- Senior Technician
  'innovation',
  'volunteer',
  'team'
);

-- Request status for member-submitted awards
CREATE TYPE award_request_status AS ENUM (
  'pending',
  'approved',
  'denied'
);

-- Quarter enum for quarterly awards
CREATE TYPE award_quarter AS ENUM (
  'Q1',
  'Q2',
  'Q3',
  'Q4'
);

-- ============================================
-- MAIN AWARDS TABLE
-- ============================================
CREATE TABLE awards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Who received the award
  recipient_profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  recipient_team_member_id UUID REFERENCES team_members(id) ON DELETE CASCADE,
  
  -- Who entered/approved the award
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  supervisor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Award type and details
  award_type award_type NOT NULL,
  award_name TEXT, -- For special awards like "Sijan Award", "Levitow Award", etc.
  
  -- For coins
  coin_presenter TEXT, -- Who presented the coin (name/title)
  coin_description TEXT, -- What was it for
  coin_date DATE, -- Date received
  
  -- For quarterly/annual awards
  quarter award_quarter, -- Q1, Q2, Q3, Q4 (null for annual)
  award_year INTEGER, -- The year of the award period
  period_start DATE, -- Start of award period
  period_end DATE, -- End of award period
  award_level award_level, -- Highest level won at
  award_category award_category,
  
  -- Team awards
  is_team_award BOOLEAN DEFAULT false,
  
  -- Cycle year for EPB relevance
  cycle_year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- Validation: Must have either recipient_profile_id or recipient_team_member_id
  CONSTRAINT valid_recipient CHECK (
    (recipient_profile_id IS NOT NULL) OR 
    (recipient_team_member_id IS NOT NULL)
  ),
  
  -- Validation: Coin type must have coin fields
  CONSTRAINT valid_coin CHECK (
    award_type != 'coin' OR (coin_presenter IS NOT NULL AND coin_date IS NOT NULL)
  ),
  
  -- Validation: Quarterly type must have quarter
  CONSTRAINT valid_quarterly CHECK (
    award_type != 'quarterly' OR (quarter IS NOT NULL AND award_year IS NOT NULL)
  ),
  
  -- Validation: Annual type must have year
  CONSTRAINT valid_annual CHECK (
    award_type != 'annual' OR award_year IS NOT NULL
  )
);

-- Index for efficient lookups
CREATE INDEX idx_awards_recipient_profile ON awards(recipient_profile_id);
CREATE INDEX idx_awards_recipient_team_member ON awards(recipient_team_member_id);
CREATE INDEX idx_awards_supervisor ON awards(supervisor_id);
CREATE INDEX idx_awards_type ON awards(award_type);
CREATE INDEX idx_awards_cycle_year ON awards(cycle_year);

-- ============================================
-- TEAM AWARD MEMBERS (for team awards)
-- ============================================
CREATE TABLE award_team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  award_id UUID NOT NULL REFERENCES awards(id) ON DELETE CASCADE,
  
  -- Team member (either profile or managed member)
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  team_member_id UUID REFERENCES team_members(id) ON DELETE CASCADE,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  
  -- Validation: Must have either profile_id or team_member_id
  CONSTRAINT valid_team_member CHECK (
    (profile_id IS NOT NULL) OR 
    (team_member_id IS NOT NULL)
  ),
  
  -- Unique constraint to prevent duplicate entries
  CONSTRAINT unique_award_member UNIQUE (award_id, profile_id, team_member_id)
);

CREATE INDEX idx_award_team_members_award ON award_team_members(award_id);

-- ============================================
-- AWARD REQUESTS (member-submitted)
-- ============================================
CREATE TABLE award_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Who is requesting the award
  requester_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Who needs to approve (supervisor)
  approver_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- For whom is the award (could be self or team member they supervise)
  recipient_profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  recipient_team_member_id UUID REFERENCES team_members(id) ON DELETE CASCADE,
  
  -- Status
  status award_request_status DEFAULT 'pending',
  reviewed_at TIMESTAMPTZ,
  denial_reason TEXT,
  
  -- Award details (same structure as awards table)
  award_type award_type NOT NULL,
  award_name TEXT,
  
  -- For coins
  coin_presenter TEXT,
  coin_description TEXT,
  coin_date DATE,
  
  -- For quarterly/annual awards
  quarter award_quarter,
  award_year INTEGER,
  period_start DATE,
  period_end DATE,
  award_level award_level,
  award_category award_category,
  
  -- Team awards
  is_team_award BOOLEAN DEFAULT false,
  
  -- Cycle year
  cycle_year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- Validation: Must have either recipient_profile_id or recipient_team_member_id
  CONSTRAINT valid_request_recipient CHECK (
    (recipient_profile_id IS NOT NULL) OR 
    (recipient_team_member_id IS NOT NULL)
  )
);

CREATE INDEX idx_award_requests_requester ON award_requests(requester_id);
CREATE INDEX idx_award_requests_approver ON award_requests(approver_id);
CREATE INDEX idx_award_requests_status ON award_requests(status);

-- Team members for award requests
CREATE TABLE award_request_team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES award_requests(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  team_member_id UUID REFERENCES team_members(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  
  CONSTRAINT valid_request_team_member CHECK (
    (profile_id IS NOT NULL) OR 
    (team_member_id IS NOT NULL)
  )
);

-- ============================================
-- COMMON AIR FORCE AWARDS REFERENCE
-- ============================================
CREATE TABLE award_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  short_name TEXT,
  description TEXT,
  award_type award_type NOT NULL,
  is_team_eligible BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Insert common Air Force awards
INSERT INTO award_catalog (name, short_name, description, award_type, is_team_eligible, display_order) VALUES
  -- Coins (usually custom, but common types)
  ('Challenge Coin', NULL, 'Challenge coin presented by leadership', 'coin', false, 1),
  
  -- Quarterly Awards
  ('Quarterly Award', NULL, 'Unit quarterly recognition', 'quarterly', true, 10),
  ('Team Quarterly Award', NULL, 'Team quarterly recognition', 'quarterly', true, 11),
  
  -- Annual Awards
  ('Annual Award', NULL, 'Unit annual recognition', 'annual', true, 20),
  ('Team Annual Award', NULL, 'Team annual recognition', 'annual', true, 21),
  
  -- Special/Named Awards
  ('John L. Levitow Award', 'Levitow', 'Highest enlisted PME graduation award', 'special', false, 100),
  ('Lance P. Sijan Award', 'Sijan', 'USAF leadership award for junior officers and enlisted', 'special', false, 101),
  ('First Sergeant of the Year', NULL, 'Annual recognition for outstanding First Sergeants', 'special', false, 102),
  ('SNCO of the Year', NULL, 'Annual recognition for outstanding SNCOs', 'special', false, 103),
  ('NCO of the Year', NULL, 'Annual recognition for outstanding NCOs', 'special', false, 104),
  ('Airman of the Year', NULL, 'Annual recognition for outstanding Airmen', 'special', false, 105),
  ('Thomas N. Barnes Award', 'Barnes', 'Outstanding SNCO at ALS', 'special', false, 106),
  ('Pitsenbarger Award', NULL, 'CCAF associate degree graduate honor', 'special', false, 107),
  ('Twelve Outstanding Airmen of the Year', 'OAY', 'AF-level annual recognition', 'special', false, 108),
  ('Volunteer of the Quarter', NULL, 'Quarterly volunteer recognition', 'quarterly', false, 150),
  ('Volunteer of the Year', NULL, 'Annual volunteer recognition', 'annual', false, 151),
  ('Innovator of the Quarter', NULL, 'Quarterly innovation recognition', 'quarterly', false, 160),
  ('Innovator of the Year', NULL, 'Annual innovation recognition', 'annual', false, 161),
  ('Spark Tank', NULL, 'Air Force innovation competition winner', 'special', true, 170),
  ('Superior Performer', NULL, 'Superior performer recognition', 'special', false, 180),
  ('Time Off Award', 'TOA', 'Time off award for exceptional performance', 'special', false, 181)
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE awards ENABLE ROW LEVEL SECURITY;
ALTER TABLE award_team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE award_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE award_request_team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE award_catalog ENABLE ROW LEVEL SECURITY;

-- Award catalog is public read
CREATE POLICY "Anyone can view award catalog"
  ON award_catalog FOR SELECT
  USING (true);

-- Awards: Supervisors in chain can view/manage
CREATE POLICY "Users can view awards for members in their chain"
  ON awards FOR SELECT
  USING (
    -- Own awards (as recipient)
    recipient_profile_id = auth.uid()
    -- Created by me
    OR created_by = auth.uid()
    -- I'm the supervisor
    OR supervisor_id = auth.uid()
    -- I'm in the supervisor chain above the award recipient
    OR recipient_profile_id IN (
      SELECT subordinate_id FROM get_subordinate_chain(auth.uid())
    )
    -- Award is for a managed member I can see
    OR recipient_team_member_id IN (
      SELECT id FROM team_members WHERE supervisor_id = auth.uid()
    )
  );

CREATE POLICY "Supervisors can insert awards"
  ON awards FOR INSERT
  WITH CHECK (
    -- Must be the creator
    created_by = auth.uid()
    AND (
      -- Adding for a direct subordinate profile
      recipient_profile_id IN (
        SELECT subordinate_id FROM teams WHERE supervisor_id = auth.uid()
      )
      -- Adding for a managed member
      OR recipient_team_member_id IN (
        SELECT id FROM team_members WHERE supervisor_id = auth.uid()
      )
      -- Adding for someone in subordinate chain
      OR recipient_profile_id IN (
        SELECT subordinate_id FROM get_subordinate_chain(auth.uid())
      )
    )
  );

CREATE POLICY "Supervisors can update their awards"
  ON awards FOR UPDATE
  USING (supervisor_id = auth.uid())
  WITH CHECK (supervisor_id = auth.uid());

CREATE POLICY "Supervisors can delete their awards"
  ON awards FOR DELETE
  USING (supervisor_id = auth.uid());

-- Award team members: inherit from parent award
CREATE POLICY "Users can view award team members"
  ON award_team_members FOR SELECT
  USING (
    award_id IN (SELECT id FROM awards)
  );

CREATE POLICY "Supervisors can manage award team members"
  ON award_team_members FOR ALL
  USING (
    award_id IN (
      SELECT id FROM awards WHERE supervisor_id = auth.uid()
    )
  );

-- Award requests
CREATE POLICY "Users can view their requests"
  ON award_requests FOR SELECT
  USING (
    requester_id = auth.uid()
    OR approver_id = auth.uid()
    OR recipient_profile_id = auth.uid()
  );

CREATE POLICY "Users can create award requests"
  ON award_requests FOR INSERT
  WITH CHECK (requester_id = auth.uid());

CREATE POLICY "Users can update their pending requests"
  ON award_requests FOR UPDATE
  USING (
    (requester_id = auth.uid() AND status = 'pending')
    OR approver_id = auth.uid()
  );

CREATE POLICY "Users can delete their pending requests"
  ON award_requests FOR DELETE
  USING (requester_id = auth.uid() AND status = 'pending');

CREATE POLICY "Users can view request team members"
  ON award_request_team_members FOR SELECT
  USING (
    request_id IN (SELECT id FROM award_requests)
  );

CREATE POLICY "Users can manage request team members"
  ON award_request_team_members FOR ALL
  USING (
    request_id IN (
      SELECT id FROM award_requests WHERE requester_id = auth.uid()
    )
  );

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to approve an award request
CREATE OR REPLACE FUNCTION approve_award_request(p_request_id UUID)
RETURNS UUID AS $$
DECLARE
  v_request award_requests;
  v_award_id UUID;
BEGIN
  -- Get the request
  SELECT * INTO v_request FROM award_requests WHERE id = p_request_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found';
  END IF;
  
  IF v_request.approver_id != auth.uid() THEN
    RAISE EXCEPTION 'Not authorized to approve this request';
  END IF;
  
  IF v_request.status != 'pending' THEN
    RAISE EXCEPTION 'Request is not pending';
  END IF;
  
  -- Create the award
  INSERT INTO awards (
    recipient_profile_id,
    recipient_team_member_id,
    created_by,
    supervisor_id,
    award_type,
    award_name,
    coin_presenter,
    coin_description,
    coin_date,
    quarter,
    award_year,
    period_start,
    period_end,
    award_level,
    award_category,
    is_team_award,
    cycle_year
  ) VALUES (
    v_request.recipient_profile_id,
    v_request.recipient_team_member_id,
    v_request.requester_id,
    auth.uid(),
    v_request.award_type,
    v_request.award_name,
    v_request.coin_presenter,
    v_request.coin_description,
    v_request.coin_date,
    v_request.quarter,
    v_request.award_year,
    v_request.period_start,
    v_request.period_end,
    v_request.award_level,
    v_request.award_category,
    v_request.is_team_award,
    v_request.cycle_year
  ) RETURNING id INTO v_award_id;
  
  -- Copy team members if team award
  IF v_request.is_team_award THEN
    INSERT INTO award_team_members (award_id, profile_id, team_member_id)
    SELECT v_award_id, profile_id, team_member_id
    FROM award_request_team_members
    WHERE request_id = p_request_id;
  END IF;
  
  -- Update request status
  UPDATE award_requests
  SET status = 'approved', reviewed_at = now(), updated_at = now()
  WHERE id = p_request_id;
  
  RETURN v_award_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to deny an award request
CREATE OR REPLACE FUNCTION deny_award_request(p_request_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS BOOLEAN AS $$
DECLARE
  v_request award_requests;
BEGIN
  SELECT * INTO v_request FROM award_requests WHERE id = p_request_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found';
  END IF;
  
  IF v_request.approver_id != auth.uid() THEN
    RAISE EXCEPTION 'Not authorized to deny this request';
  END IF;
  
  IF v_request.status != 'pending' THEN
    RAISE EXCEPTION 'Request is not pending';
  END IF;
  
  UPDATE award_requests
  SET 
    status = 'denied',
    reviewed_at = now(),
    denial_reason = p_reason,
    updated_at = now()
  WHERE id = p_request_id;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get awards for a user/member
CREATE OR REPLACE FUNCTION get_member_awards(
  p_profile_id UUID DEFAULT NULL,
  p_team_member_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  award_type award_type,
  award_name TEXT,
  coin_presenter TEXT,
  coin_description TEXT,
  coin_date DATE,
  quarter award_quarter,
  award_year INTEGER,
  award_level award_level,
  award_category award_category,
  is_team_award BOOLEAN,
  cycle_year INTEGER,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id,
    a.award_type,
    a.award_name,
    a.coin_presenter,
    a.coin_description,
    a.coin_date,
    a.quarter,
    a.award_year,
    a.award_level,
    a.award_category,
    a.is_team_award,
    a.cycle_year,
    a.created_at
  FROM awards a
  WHERE 
    (p_profile_id IS NOT NULL AND a.recipient_profile_id = p_profile_id)
    OR (p_team_member_id IS NOT NULL AND a.recipient_team_member_id = p_team_member_id)
  ORDER BY a.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_awards_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_awards_updated_at
  BEFORE UPDATE ON awards
  FOR EACH ROW
  EXECUTE FUNCTION update_awards_updated_at();

CREATE TRIGGER trigger_award_requests_updated_at
  BEFORE UPDATE ON award_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_awards_updated_at();





