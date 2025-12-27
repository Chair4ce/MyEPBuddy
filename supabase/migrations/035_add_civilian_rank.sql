-- Add Civilian to user_rank enum
-- Civilians can supervise military members but do not have EPBs

ALTER TYPE user_rank ADD VALUE IF NOT EXISTS 'Civilian';

-- Update SUPERVISOR_RANKS check constraint if it exists
-- Civilians can be supervisors



