-- Migration: Security Hardening
-- Addresses: RPC enumeration, memory exhaustion, error sanitization
-- Vulnerabilities: #5 (Error Leakage), #6 (RPC Enumeration), #9 (Memory Exhaustion), #11 (Credentials in Errors)

-- ============================================
-- 1. RPC FUNCTION ENUMERATION PROTECTION
-- Revoke EXECUTE from anon role on all public functions
-- This prevents unauthenticated users from discovering/calling RPC functions
-- ============================================

-- Revoke all function execution from anon and public roles
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM public;

-- Grant execution only to authenticated users
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- Set default privileges for future functions
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM public;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO authenticated;

-- ============================================
-- 2. FIX CHAIN FUNCTIONS SEARCH PATH
-- Update search_path from 'public' to '' for security
-- ============================================

-- Fix get_subordinate_chain with proper search_path
CREATE OR REPLACE FUNCTION public.get_subordinate_chain(supervisor_uuid UUID)
RETURNS TABLE(subordinate_id UUID, depth INT) 
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
WITH RECURSIVE chain AS (
  -- Direct subordinates (depth 1)
  SELECT t.subordinate_id, 1 as depth
  FROM public.teams t
  WHERE t.supervisor_id = supervisor_uuid
  
  UNION ALL
  
  -- Subordinates of subordinates (depth + 1)
  SELECT t.subordinate_id, c.depth + 1
  FROM public.teams t
  INNER JOIN chain c ON t.supervisor_id = c.subordinate_id
  WHERE c.depth < 10 -- Prevent infinite loops, max 10 levels deep
)
SELECT * FROM chain;
$$;

-- Fix get_supervisor_chain with proper search_path
CREATE OR REPLACE FUNCTION public.get_supervisor_chain(subordinate_uuid UUID)
RETURNS TABLE(supervisor_id UUID, depth INT) 
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
WITH RECURSIVE chain AS (
  -- Direct supervisor (depth 1)
  SELECT t.supervisor_id, 1 as depth
  FROM public.teams t
  WHERE t.subordinate_id = subordinate_uuid
  
  UNION ALL
  
  -- Supervisor of supervisors (depth + 1)
  SELECT t.supervisor_id, c.depth + 1
  FROM public.teams t
  INNER JOIN chain c ON t.subordinate_id = c.supervisor_id
  WHERE c.depth < 10 -- Prevent infinite loops
)
SELECT * FROM chain;
$$;

-- ============================================
-- 3. ADD RECURSION LIMITS TO COMPLEX FUNCTIONS
-- Prevent memory exhaustion through unbounded recursion
-- ============================================

-- Update get_all_managed_members with depth limit
CREATE OR REPLACE FUNCTION public.get_all_managed_members(supervisor_uuid uuid, max_depth integer DEFAULT 20)
RETURNS TABLE(
  id uuid, 
  supervisor_id uuid, 
  parent_profile_id uuid, 
  parent_team_member_id uuid, 
  linked_user_id uuid, 
  full_name text, 
  email text, 
  rank public.user_rank, 
  afsc text, 
  unit text, 
  is_placeholder boolean, 
  created_at timestamp with time zone, 
  updated_at timestamp with time zone
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  RETURN QUERY
  WITH RECURSIVE member_tree AS (
    -- Base case: members created by this supervisor
    SELECT tm.id, tm.supervisor_id, tm.parent_profile_id, tm.parent_team_member_id,
           tm.linked_user_id, tm.full_name, tm.email, tm.rank, tm.afsc, tm.unit,
           tm.is_placeholder, tm.created_at, tm.updated_at, 1 as depth
    FROM public.team_members tm
    WHERE tm.supervisor_id = supervisor_uuid
    
    UNION ALL
    
    -- Recursive case: members under members we already have
    SELECT child.id, child.supervisor_id, child.parent_profile_id, child.parent_team_member_id,
           child.linked_user_id, child.full_name, child.email, child.rank, child.afsc, child.unit,
           child.is_placeholder, child.created_at, child.updated_at, parent.depth + 1
    FROM public.team_members child
    JOIN member_tree parent ON child.parent_team_member_id = parent.id
    WHERE parent.depth < max_depth  -- Prevent unbounded recursion
  )
  SELECT DISTINCT 
    mt.id, mt.supervisor_id, mt.parent_profile_id, mt.parent_team_member_id,
    mt.linked_user_id, mt.full_name, mt.email, mt.rank, mt.afsc, mt.unit,
    mt.is_placeholder, mt.created_at, mt.updated_at
  FROM member_tree mt;
END;
$function$;

-- Update get_visible_managed_members with depth limit
CREATE OR REPLACE FUNCTION public.get_visible_managed_members(viewer_uuid uuid, max_depth integer DEFAULT 20)
RETURNS TABLE(
  id uuid, 
  supervisor_id uuid, 
  parent_profile_id uuid, 
  parent_team_member_id uuid, 
  linked_user_id uuid, 
  original_profile_id uuid, 
  full_name text, 
  email text, 
  rank public.user_rank, 
  afsc text, 
  unit text, 
  is_placeholder boolean, 
  member_status text, 
  supervision_start_date date, 
  supervision_end_date date, 
  created_at timestamp with time zone, 
  updated_at timestamp with time zone
)
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
      SELECT tm.*, 0 as depth
      FROM public.team_members tm
      WHERE tm.supervisor_id = viewer_uuid
      
      UNION
      
      -- Reports to viewer directly
      SELECT tm.*, 0 as depth
      FROM public.team_members tm
      WHERE tm.parent_profile_id = viewer_uuid
      
      UNION
      
      -- Created by someone in viewer's subordinate chain (rolling up)
      SELECT tm.*, 0 as depth
      FROM public.team_members tm
      WHERE tm.supervisor_id IN (SELECT scs.subordinate_id FROM subordinate_chain scs)
      
      UNION
      
      -- Reports to someone in viewer's subordinate chain
      SELECT tm.*, 0 as depth
      FROM public.team_members tm
      WHERE tm.parent_profile_id IN (SELECT scs.subordinate_id FROM subordinate_chain scs)
    ),
    -- Now we need to also include any nested managed members (children of visible managed members)
    with_nested AS (
      SELECT av.id, av.supervisor_id, av.parent_profile_id, av.parent_team_member_id,
             av.linked_user_id, av.original_profile_id, av.full_name, av.email, av.rank,
             av.afsc, av.unit, av.is_placeholder, av.member_status, av.supervision_start_date,
             av.supervision_end_date, av.created_at, av.updated_at, av.depth
      FROM all_visible av
      
      UNION ALL
      
      -- Recursively get children of managed members with depth tracking
      SELECT child.id, child.supervisor_id, child.parent_profile_id, child.parent_team_member_id,
             child.linked_user_id, child.original_profile_id, child.full_name, child.email, child.rank,
             child.afsc, child.unit, child.is_placeholder, child.member_status, child.supervision_start_date,
             child.supervision_end_date, child.created_at, child.updated_at, parent.depth + 1
      FROM public.team_members child
      JOIN with_nested parent ON child.parent_team_member_id = parent.id
      WHERE parent.depth < max_depth  -- Prevent unbounded recursion
    )
  SELECT DISTINCT 
    wn.id, wn.supervisor_id, wn.parent_profile_id, wn.parent_team_member_id,
    wn.linked_user_id, wn.original_profile_id, wn.full_name, wn.email, wn.rank,
    wn.afsc, wn.unit, wn.is_placeholder, wn.member_status, wn.supervision_start_date,
    wn.supervision_end_date, wn.created_at, wn.updated_at
  FROM with_nested wn;
END;
$function$;

-- ============================================
-- 4. SANITIZED ERROR HELPER FUNCTION
-- Provides consistent, non-revealing error messages
-- ============================================

CREATE OR REPLACE FUNCTION public.raise_security_exception(code text)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  RAISE EXCEPTION '%', 
    CASE code
      WHEN 'INSUFFICIENT_PERMISSIONS' THEN 'Insufficient permissions for this operation'
      WHEN 'NOT_AUTHORIZED' THEN 'Not authorized to perform this action'
      WHEN 'NOT_FOUND' THEN 'Resource not found'
      WHEN 'INVALID_STATUS' THEN 'Invalid status for this operation'
      WHEN 'INVALID_INPUT' THEN 'Invalid input provided'
      WHEN 'ALREADY_EXISTS' THEN 'Resource already exists'
      WHEN 'RELATIONSHIP_ERROR' THEN 'Invalid relationship'
      ELSE 'Operation failed'
    END;
END;
$function$;

-- ============================================
-- 5. UPDATE FUNCTIONS WITH SENSITIVE ERROR MESSAGES
-- Replace detailed error messages with generic ones
-- ============================================

-- Update validate_supervisor_rank to use sanitized errors
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
  
  -- Check if rank allows supervision (NCOs SSgt+ and Officers)
  IF NOT public.can_supervise(supervisor_rank) THEN
    RAISE EXCEPTION 'Insufficient permissions for this operation';
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Update validate_supervision_request to use sanitized errors
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
  
  -- If requester wants to supervise, they must have supervisor permissions
  IF NEW.request_type = 'supervise' THEN
    IF NOT public.can_supervise(requester_rank) THEN
      RAISE EXCEPTION 'Insufficient permissions for this operation';
    END IF;
    -- Check enlisted cannot supervise officers (if applicable)
    IF public.is_enlisted_rank(requester_rank) AND public.is_officer_rank(target_rank) THEN
      RAISE EXCEPTION 'Invalid relationship';
    END IF;
  END IF;
  
  -- If requester wants to be supervised, the target must have supervisor permissions
  IF NEW.request_type = 'be_supervised' THEN
    IF NOT public.can_supervise(target_rank) THEN
      RAISE EXCEPTION 'Insufficient permissions for this operation';
    END IF;
    -- Check enlisted cannot supervise officers (if applicable)
    IF public.is_enlisted_rank(target_rank) AND public.is_officer_rank(requester_rank) THEN
      RAISE EXCEPTION 'Invalid relationship';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- ============================================
-- 6. ADD STATEMENT TIMEOUT FOR SAFETY
-- Prevent long-running queries from exhausting resources
-- This is set per-session by default, but we document it here
-- ============================================

-- Note: Statement timeout should be configured in Supabase Dashboard
-- or via connection string. Setting it at database level affects all connections.
-- For functions that need longer timeouts, they can override locally.

COMMENT ON SCHEMA public IS 'Security hardening applied: RPC enumeration protection, recursion limits, sanitized errors';

-- Grant execute on the new helper function to authenticated users
GRANT EXECUTE ON FUNCTION public.raise_security_exception(text) TO authenticated;

-- ============================================
-- 7. ADDITIONAL FUNCTION SANITIZATION
-- Update remaining functions with detailed error messages
-- ============================================

-- Update validate_new_supervision (from 096_allow_officer_supervision.sql)
CREATE OR REPLACE FUNCTION public.validate_new_supervision()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  supervisor_rank public.user_rank;
  subordinate_rank public.user_rank;
BEGIN
  -- Get the supervisor's rank
  SELECT rank INTO supervisor_rank
  FROM public.profiles
  WHERE id = NEW.supervisor_id;
  
  -- Check if supervisor rank allows supervision
  IF NOT public.can_supervise(supervisor_rank) THEN
    RAISE EXCEPTION 'Insufficient permissions for this operation';
  END IF;
  
  -- Get subordinate's rank if they have a profile
  SELECT rank INTO subordinate_rank
  FROM public.profiles
  WHERE id = NEW.subordinate_id;
  
  -- If supervisor is enlisted, they cannot supervise officers
  IF public.is_enlisted_rank(supervisor_rank) AND public.is_officer_rank(subordinate_rank) THEN
    RAISE EXCEPTION 'Invalid relationship';
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Create trigger if not exists (may already exist from 096)
DROP TRIGGER IF EXISTS validate_new_supervision_trigger ON public.teams;
CREATE TRIGGER validate_new_supervision_trigger
  BEFORE INSERT ON public.teams
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_new_supervision();

-- Update approve_award_request with sanitized errors
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
    RAISE EXCEPTION 'Resource not found';
  END IF;
  
  IF v_request.approver_id != auth.uid() THEN
    RAISE EXCEPTION 'Not authorized to perform this action';
  END IF;
  
  IF v_request.status != 'pending' THEN
    RAISE EXCEPTION 'Invalid status for this operation';
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

-- Update deny_award_request with sanitized errors
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
    RAISE EXCEPTION 'Resource not found';
  END IF;
  
  IF v_request.approver_id != auth.uid() THEN
    RAISE EXCEPTION 'Not authorized to perform this action';
  END IF;
  
  IF v_request.status != 'pending' THEN
    RAISE EXCEPTION 'Invalid status for this operation';
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
