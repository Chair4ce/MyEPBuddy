-- Migration: Fix security issues flagged by Supabase linter
-- 1. Convert SECURITY DEFINER views to SECURITY INVOKER
-- 2. Add SET search_path = '' to all functions with mutable search_path

-- ============================================
-- FIX SECURITY DEFINER VIEWS
-- These views should use SECURITY INVOKER so that RLS policies
-- are enforced based on the querying user, not the view creator
-- ============================================

-- Drop and recreate shared_statements_view with security_invoker
DROP VIEW IF EXISTS shared_statements_view;

CREATE VIEW shared_statements_view WITH (security_invoker = true) AS
SELECT 
  rs.id,
  rs.user_id AS owner_id,
  rs.mpa,
  rs.afsc,
  rs.rank,
  rs.statement,
  rs.is_favorite,
  rs.statement_type,
  rs.created_at,
  rs.updated_at,
  ss.share_type,
  ss.shared_with_id,
  ss.id AS share_id,
  p.full_name AS owner_name,
  p.rank AS owner_rank
FROM refined_statements rs
JOIN statement_shares ss ON ss.statement_id = rs.id
JOIN profiles p ON p.id = rs.user_id;

-- Drop and recreate my_supervision_history with security_invoker
DROP VIEW IF EXISTS my_supervision_history;

CREATE VIEW my_supervision_history WITH (security_invoker = true) AS
SELECT 
  th.id,
  'real'::text as relationship_type,
  th.subordinate_id,
  th.supervisor_id,
  p.full_name as supervisor_name,
  p.rank::text as supervisor_rank,
  th.supervision_start_date,
  th.supervision_end_date,
  th.started_at as created_at,
  CASE WHEN th.ended_at IS NULL THEN 'current' ELSE 'ended' END as status
FROM team_history th
JOIN profiles p ON p.id = th.supervisor_id
WHERE th.subordinate_id = auth.uid()

UNION ALL

-- Include managed member history where user was linked
SELECT 
  mmh.id,
  'managed'::text as relationship_type,
  tm.linked_user_id as subordinate_id,
  mmh.supervisor_id,
  p.full_name as supervisor_name,
  p.rank::text as supervisor_rank,
  mmh.supervision_start_date,
  mmh.supervision_end_date,
  mmh.created_at,
  mmh.status
FROM managed_member_history mmh
JOIN team_members tm ON tm.id = mmh.team_member_id
JOIN profiles p ON p.id = mmh.supervisor_id
WHERE tm.linked_user_id = auth.uid();

-- Drop and recreate my_subordinate_history with security_invoker
DROP VIEW IF EXISTS my_subordinate_history;

CREATE VIEW my_subordinate_history WITH (security_invoker = true) AS
SELECT 
  th.id,
  'real'::text as relationship_type,
  th.subordinate_id as member_id,
  NULL::uuid as team_member_id,
  p.full_name as member_name,
  p.rank::text as member_rank,
  p.email as member_email,
  th.supervision_start_date,
  th.supervision_end_date,
  th.started_at as created_at,
  CASE WHEN th.ended_at IS NULL THEN 'current' ELSE 'ended' END as status
FROM team_history th
JOIN profiles p ON p.id = th.subordinate_id
WHERE th.supervisor_id = auth.uid()

UNION ALL

-- Include managed member history
SELECT 
  mmh.id,
  'managed'::text as relationship_type,
  tm.linked_user_id as member_id,
  mmh.team_member_id,
  mmh.member_name,
  mmh.member_rank::text,
  mmh.member_email,
  mmh.supervision_start_date,
  mmh.supervision_end_date,
  mmh.created_at,
  mmh.status
FROM managed_member_history mmh
JOIN team_members tm ON tm.id = mmh.team_member_id
WHERE mmh.supervisor_id = auth.uid();

-- ============================================
-- FIX FUNCTIONS WITH MUTABLE SEARCH_PATH
-- Adding SET search_path = '' prevents search path injection attacks
-- ============================================

-- approve_award_request
CREATE OR REPLACE FUNCTION public.approve_award_request(p_request_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_request public.award_requests;
  v_award_id UUID;
BEGIN
  -- Get the request
  SELECT * INTO v_request FROM public.award_requests WHERE id = p_request_id;
  
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
  INSERT INTO public.awards (
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
    INSERT INTO public.award_team_members (award_id, profile_id, team_member_id)
    SELECT v_award_id, profile_id, team_member_id
    FROM public.award_request_team_members
    WHERE request_id = p_request_id;
  END IF;
  
  -- Update request status
  UPDATE public.award_requests
  SET status = 'approved', reviewed_at = now(), updated_at = now()
  WHERE id = p_request_id;
  
  RETURN v_award_id;
END;
$function$;

-- user_can_access_shell
CREATE OR REPLACE FUNCTION public.user_can_access_shell(p_shell_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  -- Check if user is owner, creator, supervisor, or has been shared
  RETURN EXISTS (
    SELECT 1 FROM public.epb_shells WHERE id = p_shell_id AND (user_id = p_user_id OR created_by = p_user_id)
  ) OR EXISTS (
    SELECT 1 FROM public.epb_shells s
    JOIN public.teams t ON t.user_id = s.user_id
    WHERE s.id = p_shell_id AND t.supervisor_id = p_user_id
  ) OR EXISTS (
    SELECT 1 FROM public.epb_shell_shares WHERE shell_id = p_shell_id AND shared_with_id = p_user_id
  );
END;
$function$;

-- set_statement_created_by
CREATE OR REPLACE FUNCTION public.set_statement_created_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$function$;

-- deny_award_request
CREATE OR REPLACE FUNCTION public.deny_award_request(p_request_id uuid, p_reason text DEFAULT NULL::text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_request public.award_requests;
BEGIN
  SELECT * INTO v_request FROM public.award_requests WHERE id = p_request_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found';
  END IF;
  
  IF v_request.approver_id != auth.uid() THEN
    RAISE EXCEPTION 'Not authorized to deny this request';
  END IF;
  
  IF v_request.status != 'pending' THEN
    RAISE EXCEPTION 'Request is not pending';
  END IF;
  
  UPDATE public.award_requests
  SET 
    status = 'denied',
    reviewed_at = now(),
    denial_reason = p_reason,
    updated_at = now()
  WHERE id = p_request_id;
  
  RETURN TRUE;
END;
$function$;

-- get_member_awards
CREATE OR REPLACE FUNCTION public.get_member_awards(p_profile_id uuid DEFAULT NULL::uuid, p_team_member_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(id uuid, award_type public.award_type, award_name text, coin_presenter text, coin_description text, coin_date date, quarter public.award_quarter, award_year integer, award_level public.award_level, award_category public.award_category, is_team_award boolean, cycle_year integer, created_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
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
  FROM public.awards a
  WHERE 
    (p_profile_id IS NOT NULL AND a.recipient_profile_id = p_profile_id)
    OR (p_team_member_id IS NOT NULL AND a.recipient_team_member_id = p_team_member_id)
  ORDER BY a.created_at DESC;
END;
$function$;

-- update_awards_updated_at
CREATE OR REPLACE FUNCTION public.update_awards_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- migrate_managed_member_data
CREATE OR REPLACE FUNCTION public.migrate_managed_member_data()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  -- Update accomplishments to set user_id for linked user
  UPDATE public.accomplishments
  SET user_id = NEW.linked_user_id
  WHERE team_member_id = NEW.id
    AND NEW.linked_user_id IS NOT NULL
    AND NEW.is_placeholder = false;
  
  -- Update statement_history
  UPDATE public.statement_history
  SET ratee_id = NEW.linked_user_id
  WHERE team_member_id = NEW.id
    AND NEW.linked_user_id IS NOT NULL
    AND NEW.is_placeholder = false;
  
  -- Update refined_statements
  UPDATE public.refined_statements
  SET user_id = NEW.linked_user_id
  WHERE team_member_id = NEW.id
    AND NEW.linked_user_id IS NOT NULL
    AND NEW.is_placeholder = false;
  
  RETURN NEW;
END;
$function$;

-- get_chain_managed_members
CREATE OR REPLACE FUNCTION public.get_chain_managed_members(supervisor_uuid uuid)
RETURNS TABLE(id uuid, supervisor_id uuid, parent_profile_id uuid, linked_user_id uuid, full_name text, email text, rank public.user_rank, afsc text, unit text, is_placeholder boolean, created_at timestamp with time zone, updated_at timestamp with time zone)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  RETURN QUERY
  SELECT tm.*
  FROM public.team_members tm
  WHERE 
    -- Direct: parent is the supervisor
    tm.parent_profile_id = supervisor_uuid
    OR
    -- Indirect: parent is in the supervisor's subordinate chain
    tm.parent_profile_id IN (
      SELECT subordinate_id FROM public.get_subordinate_chain(supervisor_uuid)
    );
END;
$function$;

-- check_team_member_email_for_existing_user
CREATE OR REPLACE FUNCTION public.check_team_member_email_for_existing_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_existing_user_id UUID;
BEGIN
  -- Only trigger on email changes
  IF OLD.email IS DISTINCT FROM NEW.email AND NEW.email IS NOT NULL THEN
    -- Check if a profile exists with this email
    SELECT id INTO v_existing_user_id
    FROM public.profiles
    WHERE email = NEW.email
      AND id != COALESCE(NEW.linked_user_id, '00000000-0000-0000-0000-000000000000');

    IF v_existing_user_id IS NOT NULL THEN
      -- Create a pending link (ignore conflicts)
      INSERT INTO public.pending_managed_links (user_id, team_member_id)
      VALUES (v_existing_user_id, NEW.id)
      ON CONFLICT (user_id, team_member_id) DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- get_all_managed_members
CREATE OR REPLACE FUNCTION public.get_all_managed_members(supervisor_uuid uuid)
RETURNS TABLE(id uuid, supervisor_id uuid, parent_profile_id uuid, parent_team_member_id uuid, linked_user_id uuid, full_name text, email text, rank public.user_rank, afsc text, unit text, is_placeholder boolean, created_at timestamp with time zone, updated_at timestamp with time zone)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  RETURN QUERY
  WITH RECURSIVE member_tree AS (
    -- Base case: members created by this supervisor
    SELECT tm.*
    FROM public.team_members tm
    WHERE tm.supervisor_id = supervisor_uuid
    
    UNION ALL
    
    -- Recursive case: members under members we already have
    SELECT child.*
    FROM public.team_members child
    JOIN member_tree parent ON child.parent_team_member_id = parent.id
  )
  SELECT DISTINCT * FROM member_tree;
END;
$function$;

-- acquire_section_lock
CREATE OR REPLACE FUNCTION public.acquire_section_lock(p_section_id uuid, p_user_id uuid)
RETURNS TABLE(success boolean, locked_by_name text, locked_by_rank text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_existing_lock public.epb_section_locks%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
BEGIN
  -- Clean up expired locks first
  DELETE FROM public.epb_section_locks WHERE expires_at < NOW();
  
  -- Check for existing lock
  SELECT * INTO v_existing_lock 
  FROM public.epb_section_locks 
  WHERE section_id = p_section_id;
  
  IF v_existing_lock.id IS NOT NULL THEN
    -- Lock exists
    IF v_existing_lock.user_id = p_user_id THEN
      -- User already has the lock, refresh it
      UPDATE public.epb_section_locks 
      SET expires_at = NOW() + INTERVAL '5 minutes'
      WHERE id = v_existing_lock.id;
      
      RETURN QUERY SELECT true, NULL::TEXT, NULL::TEXT;
    ELSE
      -- Someone else has the lock
      SELECT * INTO v_profile FROM public.profiles WHERE id = v_existing_lock.user_id;
      RETURN QUERY SELECT false, v_profile.full_name, v_profile.rank::TEXT;
    END IF;
  ELSE
    -- No lock exists, acquire it
    INSERT INTO public.epb_section_locks (section_id, user_id)
    VALUES (p_section_id, p_user_id);
    
    RETURN QUERY SELECT true, NULL::TEXT, NULL::TEXT;
  END IF;
END;
$function$;

-- create_team_history
CREATE OR REPLACE FUNCTION public.create_team_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  -- End any existing active relationship for this subordinate with this supervisor
  UPDATE public.team_history 
  SET ended_at = now(),
      supervision_end_date = COALESCE(NEW.supervision_start_date, CURRENT_DATE) - INTERVAL '1 day'
  WHERE subordinate_id = NEW.subordinate_id 
    AND supervisor_id = NEW.supervisor_id
    AND ended_at IS NULL;
  
  -- Create new history entry with supervision dates
  INSERT INTO public.team_history (
    subordinate_id, 
    supervisor_id, 
    started_at,
    supervision_start_date
  )
  VALUES (
    NEW.subordinate_id, 
    NEW.supervisor_id, 
    now(),
    COALESCE(NEW.supervision_start_date, CURRENT_DATE)
  );
  
  RETURN NEW;
END;
$function$;

-- release_section_lock
CREATE OR REPLACE FUNCTION public.release_section_lock(p_section_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  DELETE FROM public.epb_section_locks 
  WHERE section_id = p_section_id AND user_id = p_user_id;
  
  RETURN FOUND;
END;
$function$;

-- end_team_history
CREATE OR REPLACE FUNCTION public.end_team_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  UPDATE public.team_history 
  SET ended_at = now(),
      supervision_end_date = COALESCE(OLD.supervision_end_date, CURRENT_DATE)
  WHERE subordinate_id = OLD.subordinate_id 
    AND supervisor_id = OLD.supervisor_id
    AND ended_at IS NULL;
  
  RETURN OLD;
END;
$function$;

-- refresh_section_lock
CREATE OR REPLACE FUNCTION public.refresh_section_lock(p_section_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  UPDATE public.epb_section_locks 
  SET expires_at = NOW() + INTERVAL '5 minutes'
  WHERE section_id = p_section_id AND user_id = p_user_id;
  
  RETURN FOUND;
END;
$function$;

-- get_shell_section_locks
CREATE OR REPLACE FUNCTION public.get_shell_section_locks(p_shell_id uuid)
RETURNS TABLE(section_id uuid, mpa_key text, user_id uuid, user_name text, user_rank text, acquired_at timestamp with time zone, expires_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  -- Clean up expired locks first
  DELETE FROM public.epb_section_locks WHERE public.epb_section_locks.expires_at < NOW();
  
  RETURN QUERY
  SELECT 
    l.section_id AS section_id,
    s.mpa AS mpa_key,
    l.user_id AS user_id,
    p.full_name AS user_name,
    p.rank::TEXT AS user_rank,
    l.acquired_at AS acquired_at,
    l.expires_at AS expires_at
  FROM public.epb_section_locks l
  JOIN public.epb_shell_sections s ON s.id = l.section_id
  JOIN public.profiles p ON p.id = l.user_id
  WHERE s.shell_id = p_shell_id;
END;
$function$;

-- get_visible_managed_members
CREATE OR REPLACE FUNCTION public.get_visible_managed_members(viewer_uuid uuid)
RETURNS TABLE(id uuid, supervisor_id uuid, parent_profile_id uuid, parent_team_member_id uuid, linked_user_id uuid, original_profile_id uuid, full_name text, email text, rank public.user_rank, afsc text, unit text, is_placeholder boolean, member_status text, supervision_start_date date, supervision_end_date date, created_at timestamp with time zone, updated_at timestamp with time zone)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  RETURN QUERY
  WITH RECURSIVE
    -- Get the user's subordinate chain (all people they supervise, directly or indirectly)
    subordinate_chain AS (
      SELECT sc.subordinate_id FROM public.get_subordinate_chain(viewer_uuid) sc
    ),
    -- Get all managed members in the tree, starting from those created by viewer or their subordinates
    all_visible AS (
      -- Direct ownership: created by the viewer
      SELECT tm.*
      FROM public.team_members tm
      WHERE tm.supervisor_id = viewer_uuid
      
      UNION
      
      -- Reports to viewer directly
      SELECT tm.*
      FROM public.team_members tm
      WHERE tm.parent_profile_id = viewer_uuid
      
      UNION
      
      -- Created by someone in viewer's subordinate chain (rolling up)
      SELECT tm.*
      FROM public.team_members tm
      WHERE tm.supervisor_id IN (SELECT scs.subordinate_id FROM subordinate_chain scs)
      
      UNION
      
      -- Reports to someone in viewer's subordinate chain
      SELECT tm.*
      FROM public.team_members tm
      WHERE tm.parent_profile_id IN (SELECT scs.subordinate_id FROM subordinate_chain scs)
    ),
    -- Now we need to also include any nested managed members (children of visible managed members)
    with_nested AS (
      SELECT * FROM all_visible
      
      UNION ALL
      
      -- Recursively get children of managed members
      SELECT child.*
      FROM public.team_members child
      JOIN with_nested parent ON child.parent_team_member_id = parent.id
    )
  SELECT DISTINCT 
    wn.id,
    wn.supervisor_id,
    wn.parent_profile_id,
    wn.parent_team_member_id,
    wn.linked_user_id,
    wn.original_profile_id,
    wn.full_name,
    wn.email,
    wn.rank,
    wn.afsc,
    wn.unit,
    wn.is_placeholder,
    wn.member_status,
    wn.supervision_start_date,
    wn.supervision_end_date,
    wn.created_at,
    wn.updated_at
  FROM with_nested wn;
END;
$function$;

-- set_supervision_start_date
CREATE OR REPLACE FUNCTION public.set_supervision_start_date()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF NEW.supervision_start_date IS NULL THEN
    NEW.supervision_start_date := CURRENT_DATE;
  END IF;
  RETURN NEW;
END;
$function$;

-- set_team_member_supervision_start_date
CREATE OR REPLACE FUNCTION public.set_team_member_supervision_start_date()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF NEW.supervision_start_date IS NULL THEN
    NEW.supervision_start_date := CURRENT_DATE;
  END IF;
  RETURN NEW;
END;
$function$;

-- update_epb_shell_updated_at
CREATE OR REPLACE FUNCTION public.update_epb_shell_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- create_epb_shell_sections
CREATE OR REPLACE FUNCTION public.create_epb_shell_sections()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  -- Insert all standard MPA sections for the new shell
  INSERT INTO public.epb_shell_sections (shell_id, mpa, last_edited_by)
  VALUES 
    (NEW.id, 'executing_mission', NEW.created_by),
    (NEW.id, 'leading_people', NEW.created_by),
    (NEW.id, 'managing_resources', NEW.created_by),
    (NEW.id, 'improving_unit', NEW.created_by),
    (NEW.id, 'hlr_assessment', NEW.created_by);
  RETURN NEW;
END;
$function$;

-- get_epb_shell_with_sections
CREATE OR REPLACE FUNCTION public.get_epb_shell_with_sections(p_shell_id uuid)
RETURNS TABLE(shell_id uuid, user_id uuid, team_member_id uuid, cycle_year integer, created_by uuid, shell_created_at timestamp with time zone, shell_updated_at timestamp with time zone, section_id uuid, mpa text, statement_text text, section_updated_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    es.id AS shell_id,
    es.user_id,
    es.team_member_id,
    es.cycle_year,
    es.created_by,
    es.created_at AS shell_created_at,
    es.updated_at AS shell_updated_at,
    ess.id AS section_id,
    ess.mpa,
    ess.statement_text,
    ess.updated_at AS section_updated_at
  FROM public.epb_shells es
  LEFT JOIN public.epb_shell_sections ess ON ess.shell_id = es.id
  WHERE es.id = p_shell_id
  ORDER BY 
    CASE ess.mpa
      WHEN 'executing_mission' THEN 1
      WHEN 'leading_people' THEN 2
      WHEN 'managing_resources' THEN 3
      WHEN 'improving_unit' THEN 4
      WHEN 'hlr_assessment' THEN 5
      ELSE 6
    END;
END;
$function$;

-- sync_supervision_dates_to_history
CREATE OR REPLACE FUNCTION public.sync_supervision_dates_to_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  -- Update the active history entry with the new dates
  UPDATE public.team_history
  SET 
    supervision_start_date = NEW.supervision_start_date,
    supervision_end_date = NEW.supervision_end_date
  WHERE subordinate_id = NEW.subordinate_id
    AND supervisor_id = NEW.supervisor_id
    AND ended_at IS NULL;
  
  RETURN NEW;
END;
$function$;

-- create_managed_member_history
CREATE OR REPLACE FUNCTION public.create_managed_member_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  INSERT INTO public.managed_member_history (
    supervisor_id,
    team_member_id,
    member_name,
    member_rank,
    member_email,
    supervision_start_date,
    status
  ) VALUES (
    NEW.supervisor_id,
    NEW.id,
    NEW.full_name,
    NEW.rank,
    NEW.email,
    COALESCE(NEW.supervision_start_date, CURRENT_DATE),
    NEW.member_status
  );
  RETURN NEW;
END;
$function$;

-- sync_managed_member_history
CREATE OR REPLACE FUNCTION public.sync_managed_member_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  UPDATE public.managed_member_history
  SET 
    member_name = NEW.full_name,
    member_rank = NEW.rank,
    member_email = NEW.email,
    supervision_start_date = NEW.supervision_start_date,
    supervision_end_date = NEW.supervision_end_date,
    status = NEW.member_status,
    updated_at = now()
  WHERE team_member_id = NEW.id
    AND supervisor_id = NEW.supervisor_id;
  
  RETURN NEW;
END;
$function$;

-- set_section_session_code
CREATE OR REPLACE FUNCTION public.set_section_session_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  new_code VARCHAR(8);
  code_exists BOOLEAN;
BEGIN
  LOOP
    new_code := public.generate_session_code();
    -- Check both workspace_sessions and epb_section_editing_sessions for uniqueness
    SELECT EXISTS(
      SELECT 1 FROM public.workspace_sessions WHERE session_code = new_code
      UNION
      SELECT 1 FROM public.epb_section_editing_sessions WHERE session_code = new_code
    ) INTO code_exists;
    EXIT WHEN NOT code_exists;
  END LOOP;
  NEW.session_code := new_code;
  RETURN NEW;
END;
$function$;

-- update_section_session_timestamp
CREATE OR REPLACE FUNCTION public.update_section_session_timestamp()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  NEW.updated_at := NOW();
  NEW.last_activity_at := NOW();
  RETURN NEW;
END;
$function$;

-- cleanup_stale_section_sessions
CREATE OR REPLACE FUNCTION public.cleanup_stale_section_sessions()
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  -- Deactivate sessions that have expired or been inactive for > 30 minutes
  UPDATE public.epb_section_editing_sessions
  SET is_active = false
  WHERE is_active = true
    AND (expires_at < NOW() OR last_activity_at < NOW() - INTERVAL '30 minutes');
END;
$function$;

-- validate_supervision_request
CREATE OR REPLACE FUNCTION public.validate_supervision_request()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  requester_rank public.user_rank;
  target_rank public.user_rank;
BEGIN
  -- Get ranks
  SELECT rank INTO requester_rank FROM public.profiles WHERE id = NEW.requester_id;
  SELECT rank INTO target_rank FROM public.profiles WHERE id = NEW.target_id;
  
  -- If requester wants to supervise, they must be SSgt+
  IF NEW.request_type = 'supervise' THEN
    IF requester_rank NOT IN ('SSgt', 'TSgt', 'MSgt', 'SMSgt', 'CMSgt') THEN
      RAISE EXCEPTION 'Only SSgt and above can supervise others';
    END IF;
  END IF;
  
  -- If requester wants to be supervised, the target must be SSgt+
  IF NEW.request_type = 'be_supervised' THEN
    IF target_rank NOT IN ('SSgt', 'TSgt', 'MSgt', 'SMSgt', 'CMSgt') THEN
      RAISE EXCEPTION 'Only SSgt and above can be requested as supervisors';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- can_view_team_member
CREATE OR REPLACE FUNCTION public.can_view_team_member(tm_supervisor_id uuid, tm_parent_profile_id uuid, tm_parent_team_member_id uuid, tm_linked_user_id uuid, viewer_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  parent_member_supervisor UUID;
BEGIN
  -- Direct ownership
  IF tm_supervisor_id = viewer_id THEN
    RETURN TRUE;
  END IF;
  
  -- Reports directly to viewer
  IF tm_parent_profile_id = viewer_id THEN
    RETURN TRUE;
  END IF;
  
  -- Viewer is linked to this record
  IF tm_linked_user_id = viewer_id THEN
    RETURN TRUE;
  END IF;
  
  -- Created by someone viewer supervises (rolling up)
  IF EXISTS (
    SELECT 1 FROM public.get_subordinate_chain(viewer_id) sc
    WHERE sc.subordinate_id = tm_supervisor_id
  ) THEN
    RETURN TRUE;
  END IF;
  
  -- Reports to someone viewer supervises
  IF tm_parent_profile_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.get_subordinate_chain(viewer_id) sc
    WHERE sc.subordinate_id = tm_parent_profile_id
  ) THEN
    RETURN TRUE;
  END IF;
  
  -- Parent is a managed member - check if viewer created that parent OR supervises the parent's creator
  IF tm_parent_team_member_id IS NOT NULL THEN
    SELECT supervisor_id INTO parent_member_supervisor
    FROM public.team_members
    WHERE id = tm_parent_team_member_id;
    
    IF parent_member_supervisor = viewer_id THEN
      RETURN TRUE;
    END IF;
    
    IF EXISTS (
      SELECT 1 FROM public.get_subordinate_chain(viewer_id) sc
      WHERE sc.subordinate_id = parent_member_supervisor
    ) THEN
      RETURN TRUE;
    END IF;
  END IF;
  
  RETURN FALSE;
END;
$function$;

-- populate_participant_profile
CREATE OR REPLACE FUNCTION public.populate_participant_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  SELECT full_name, rank INTO NEW.full_name, NEW.rank
  FROM public.profiles WHERE id = NEW.user_id;
  
  -- Auto-approve hosts
  IF NEW.is_host = true THEN
    NEW.status := 'approved';
  END IF;
  
  RETURN NEW;
END;
$function$;

-- update_statement_vote_counts
CREATE OR REPLACE FUNCTION public.update_statement_vote_counts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.vote_type = 'up' THEN
      UPDATE public.community_statements SET upvotes = upvotes + 1 WHERE id = NEW.statement_id;
    ELSE
      UPDATE public.community_statements SET downvotes = downvotes + 1 WHERE id = NEW.statement_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.vote_type = 'up' THEN
      UPDATE public.community_statements SET upvotes = GREATEST(upvotes - 1, 0) WHERE id = OLD.statement_id;
    ELSE
      UPDATE public.community_statements SET downvotes = GREATEST(downvotes - 1, 0) WHERE id = OLD.statement_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Handle vote change (up to down or vice versa)
    IF OLD.vote_type = 'up' AND NEW.vote_type = 'down' THEN
      UPDATE public.community_statements 
      SET upvotes = GREATEST(upvotes - 1, 0), downvotes = downvotes + 1 
      WHERE id = NEW.statement_id;
    ELSIF OLD.vote_type = 'down' AND NEW.vote_type = 'up' THEN
      UPDATE public.community_statements 
      SET downvotes = GREATEST(downvotes - 1, 0), upvotes = upvotes + 1 
      WHERE id = NEW.statement_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- update_updated_at_column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

-- can_supervise
CREATE OR REPLACE FUNCTION public.can_supervise(rank_value public.user_rank)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $function$
BEGIN
  RETURN rank_value IN ('SSgt', 'TSgt', 'MSgt', 'SMSgt', 'CMSgt');
END;
$function$;

-- validate_supervisor_rank
CREATE OR REPLACE FUNCTION public.validate_supervisor_rank()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  supervisor_rank public.user_rank;
BEGIN
  -- Get the supervisor's rank
  SELECT rank INTO supervisor_rank
  FROM public.profiles
  WHERE id = NEW.supervisor_id;
  
  -- Check if rank allows supervision
  IF supervisor_rank IS NULL OR supervisor_rank NOT IN ('SSgt', 'TSgt', 'MSgt', 'SMSgt', 'CMSgt') THEN
    RAISE EXCEPTION 'Only SSgt and above can supervise others. Current rank: %', supervisor_rank;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, role, terms_accepted_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url',
    'member',
    NULL
  );
  RETURN NEW;
END;
$function$;

-- generate_session_code
CREATE OR REPLACE FUNCTION public.generate_session_code()
RETURNS character varying
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  chars VARCHAR := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- Exclude confusing chars like 0/O, 1/I
  result VARCHAR := '';
  i INTEGER;
BEGIN
  FOR i IN 1..6 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN result;
END;
$function$;

-- set_session_code
CREATE OR REPLACE FUNCTION public.set_session_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  new_code VARCHAR(8);
  code_exists BOOLEAN;
BEGIN
  LOOP
    new_code := public.generate_session_code();
    SELECT EXISTS(SELECT 1 FROM public.workspace_sessions WHERE session_code = new_code) INTO code_exists;
    EXIT WHEN NOT code_exists;
  END LOOP;
  NEW.session_code := new_code;
  RETURN NEW;
END;
$function$;

-- update_workspace_session_timestamp
CREATE OR REPLACE FUNCTION public.update_workspace_session_timestamp()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$function$;




