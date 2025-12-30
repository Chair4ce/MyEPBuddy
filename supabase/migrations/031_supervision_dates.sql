-- Migration: Add supervision date tracking to teams table
-- Tracks when supervision started and ended for each relationship

-- Add supervision date columns
ALTER TABLE teams
ADD COLUMN IF NOT EXISTS supervision_start_date date,
ADD COLUMN IF NOT EXISTS supervision_end_date date;

-- Set default start date for existing relationships to their created_at date
UPDATE teams
SET supervision_start_date = created_at::date
WHERE supervision_start_date IS NULL;

-- Function to set supervision_start_date on insert if not provided
CREATE OR REPLACE FUNCTION set_supervision_start_date()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.supervision_start_date IS NULL THEN
    NEW.supervision_start_date := CURRENT_DATE;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_set_supervision_start_date ON teams;
CREATE TRIGGER trigger_set_supervision_start_date
  BEFORE INSERT ON teams
  FOR EACH ROW
  EXECUTE FUNCTION set_supervision_start_date();

-- Function to update supervision dates (for supervisors only)
CREATE OR REPLACE FUNCTION update_supervision_dates(
  p_subordinate_id uuid,
  p_start_date date,
  p_end_date date DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify the caller is the supervisor
  UPDATE teams
  SET 
    supervision_start_date = p_start_date,
    supervision_end_date = p_end_date
  WHERE supervisor_id = auth.uid()
    AND subordinate_id = p_subordinate_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Team relationship not found or not authorized';
  END IF;

  RETURN json_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION update_supervision_dates(uuid, date, date) TO authenticated;

-- Also track dates for managed members
ALTER TABLE team_members
ADD COLUMN IF NOT EXISTS supervision_start_date date,
ADD COLUMN IF NOT EXISTS supervision_end_date date;

-- Set default for existing managed members
UPDATE team_members
SET supervision_start_date = created_at::date
WHERE supervision_start_date IS NULL;

-- Trigger for managed members
CREATE OR REPLACE FUNCTION set_team_member_supervision_start_date()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.supervision_start_date IS NULL THEN
    NEW.supervision_start_date := CURRENT_DATE;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_set_team_member_supervision_start_date ON team_members;
CREATE TRIGGER trigger_set_team_member_supervision_start_date
  BEFORE INSERT ON team_members
  FOR EACH ROW
  EXECUTE FUNCTION set_team_member_supervision_start_date();

-- Function to update managed member supervision dates
CREATE OR REPLACE FUNCTION update_managed_member_dates(
  p_team_member_id uuid,
  p_start_date date,
  p_end_date date DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify the caller is the supervisor
  UPDATE team_members
  SET 
    supervision_start_date = p_start_date,
    supervision_end_date = p_end_date
  WHERE id = p_team_member_id
    AND supervisor_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Team member not found or not authorized';
  END IF;

  RETURN json_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION update_managed_member_dates(uuid, date, date) TO authenticated;

-- Index for date queries
CREATE INDEX IF NOT EXISTS idx_teams_supervision_dates ON teams(supervision_start_date, supervision_end_date);
CREATE INDEX IF NOT EXISTS idx_team_members_supervision_dates ON team_members(supervision_start_date, supervision_end_date);





