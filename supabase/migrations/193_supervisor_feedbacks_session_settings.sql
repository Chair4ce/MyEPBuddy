-- Midterm/Final: separate ACA session settings (form prep) from generated Feedback Session Guide content.

ALTER TABLE supervisor_feedbacks
  ADD COLUMN IF NOT EXISTS session_settings TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN supervisor_feedbacks.session_settings IS
  'Private ACA form-prep checklist for midterm/final. content holds the generated Feedback Session Guide outline.';

-- Move checklist-like midterm/final drafts into session_settings; clear content for Generate.
UPDATE supervisor_feedbacks
SET
  session_settings = content,
  content = ''
WHERE feedback_type IN ('midterm', 'final')
  AND COALESCE(NULLIF(TRIM(session_settings), ''), '') = ''
  AND TRIM(content) <> ''
  AND (
    content ILIKE '%## Performance assessment%'
    OR content ILIKE '%Knowing your Airman%'
    OR content ILIKE '%Midterm ACA — Session Guide%'
    OR content ILIKE '%Midterm ACA - Session Guide%'
    OR content ILIKE '%End-of-Reporting Period ACA%'
    OR content ILIKE '%Progress vs Initial expectations%'
    OR content ILIKE '%Performance closeout by ACA area%'
  );

-- Replace prior 6-arg upsert (signature change) so session_settings can be persisted.
DROP FUNCTION IF EXISTS upsert_supervisor_feedback(UUID, UUID, TEXT, INTEGER, TEXT, UUID[]);

CREATE OR REPLACE FUNCTION upsert_supervisor_feedback(
  p_subordinate_id UUID,
  p_team_member_id UUID,
  p_feedback_type TEXT,
  p_cycle_year INTEGER,
  p_content TEXT,
  p_reviewed_accomplishment_ids UUID[] DEFAULT '{}',
  p_session_settings TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_supervisor_id UUID := auth.uid();
  v_supervision_start DATE;
  v_supervision_end DATE;
  v_feedback_id UUID;
BEGIN
  IF p_subordinate_id IS NULL AND p_team_member_id IS NULL THEN
    RAISE EXCEPTION 'Either subordinate_id or team_member_id must be provided';
  END IF;

  IF p_subordinate_id IS NOT NULL AND p_team_member_id IS NOT NULL THEN
    RAISE EXCEPTION 'Only one of subordinate_id or team_member_id should be provided';
  END IF;

  IF p_feedback_type NOT IN ('initial', 'midterm', 'final') THEN
    RAISE EXCEPTION 'Invalid feedback type. Must be initial, midterm, or final';
  END IF;

  IF p_subordinate_id IS NOT NULL THEN
    SELECT supervision_start_date, supervision_end_date
    INTO v_supervision_start, v_supervision_end
    FROM teams
    WHERE supervisor_id = v_supervisor_id
      AND subordinate_id = p_subordinate_id;

    IF v_supervision_start IS NULL THEN
      RAISE EXCEPTION 'No active supervision relationship found';
    END IF;
  END IF;

  IF p_team_member_id IS NOT NULL THEN
    SELECT supervision_start_date, supervision_end_date
    INTO v_supervision_start, v_supervision_end
    FROM team_members
    WHERE id = p_team_member_id
      AND supervisor_id = v_supervisor_id;

    IF v_supervision_start IS NULL THEN
      RAISE EXCEPTION 'No managed member relationship found';
    END IF;
  END IF;

  UPDATE supervisor_feedbacks
  SET
    content = p_content,
    reviewed_accomplishment_ids = p_reviewed_accomplishment_ids,
    session_settings = COALESCE(p_session_settings, session_settings),
    updated_at = now()
  WHERE supervisor_id = v_supervisor_id
    AND feedback_type = p_feedback_type
    AND cycle_year = p_cycle_year
    AND status = 'draft'
    AND (
      (p_subordinate_id IS NOT NULL AND subordinate_id = p_subordinate_id) OR
      (p_team_member_id IS NOT NULL AND team_member_id = p_team_member_id)
    )
  RETURNING id INTO v_feedback_id;

  IF v_feedback_id IS NULL THEN
    INSERT INTO supervisor_feedbacks (
      supervisor_id,
      subordinate_id,
      team_member_id,
      feedback_type,
      cycle_year,
      content,
      reviewed_accomplishment_ids,
      session_settings,
      supervision_start_date,
      supervision_end_date
    )
    VALUES (
      v_supervisor_id,
      p_subordinate_id,
      p_team_member_id,
      p_feedback_type,
      p_cycle_year,
      p_content,
      p_reviewed_accomplishment_ids,
      COALESCE(p_session_settings, ''),
      v_supervision_start,
      v_supervision_end
    )
    RETURNING id INTO v_feedback_id;
  END IF;

  RETURN v_feedback_id;
END;
$$;

GRANT EXECUTE ON FUNCTION upsert_supervisor_feedback(UUID, UUID, TEXT, INTEGER, TEXT, UUID[], TEXT) TO authenticated;
