-- Restore process_style_feedback to the real user_style_profiles schema
-- (migration 075). Migration 116 incorrectly referenced preferred_version,
-- aggressiveness, fill_to_max, and updated_at — columns that never existed.

CREATE OR REPLACE FUNCTION public.process_style_feedback(
  p_user_id UUID,
  p_batch_size INTEGER DEFAULT 50
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  events_processed INTEGER := 0;
  event_record RECORD;
  v_version INTEGER;
  v_aggressiveness INTEGER;
  v_fill_to_max BOOLEAN;
BEGIN
  FOR event_record IN
    SELECT id, event_type, payload
    FROM public.style_feedback_events
    WHERE user_id = p_user_id AND processed = false
    ORDER BY created_at ASC
    LIMIT p_batch_size
  LOOP
    CASE event_record.event_type
      WHEN 'revision_selected', 'revision_copied' THEN
        v_version := (event_record.payload->>'version')::INTEGER;

        UPDATE public.user_style_profiles
        SET
          version_1_count = version_1_count + CASE WHEN v_version = 1 THEN 1 ELSE 0 END,
          version_2_count = version_2_count + CASE WHEN v_version = 2 THEN 1 ELSE 0 END,
          version_3_count = version_3_count + CASE WHEN v_version = 3 THEN 1 ELSE 0 END,
          version_other_count = version_other_count + CASE WHEN v_version > 3 THEN 1 ELSE 0 END,
          total_revisions_selected = total_revisions_selected + 1,
          last_updated = now()
        WHERE user_id = p_user_id;

      WHEN 'slider_used' THEN
        v_aggressiveness := (event_record.payload->>'value')::INTEGER;

        UPDATE public.user_style_profiles
        SET
          avg_aggressiveness = (
            (avg_aggressiveness * aggressiveness_samples + v_aggressiveness) /
            (aggressiveness_samples + 1)
          )::SMALLINT,
          aggressiveness_samples = aggressiveness_samples + 1,
          last_updated = now()
        WHERE user_id = p_user_id;

      WHEN 'toggle_used' THEN
        v_fill_to_max := (event_record.payload->>'fill_to_max')::BOOLEAN;

        UPDATE public.user_style_profiles
        SET
          fill_to_max_ratio = (
            (fill_to_max_ratio * fill_to_max_samples + CASE WHEN v_fill_to_max THEN 100 ELSE 0 END) /
            (fill_to_max_samples + 1)
          )::SMALLINT,
          fill_to_max_samples = fill_to_max_samples + 1,
          last_updated = now()
        WHERE user_id = p_user_id;

      WHEN 'statement_finalized' THEN
        UPDATE public.user_style_profiles
        SET
          total_statements_analyzed = total_statements_analyzed + 1,
          last_updated = now()
        WHERE user_id = p_user_id;

      WHEN 'statement_edited' THEN
        UPDATE public.user_style_profiles
        SET
          total_manual_edits = total_manual_edits + 1,
          last_updated = now()
        WHERE user_id = p_user_id;

      ELSE
        NULL;
    END CASE;

    UPDATE public.style_feedback_events
    SET processed = true, processed_at = now()
    WHERE id = event_record.id;

    events_processed := events_processed + 1;
  END LOOP;

  RETURN events_processed;
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_style_feedback(UUID, INTEGER) TO authenticated;
