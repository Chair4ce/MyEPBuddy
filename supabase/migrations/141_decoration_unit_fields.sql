-- Expand the single "unit" column into structured assignment fields for
-- building the opening sentence of a decoration citation.
-- Example: "...as Flight Chief, 42 CS/SCOO, 67th Fighter Squadron,
--           18th Operations Group, 480 ISR Wing, Kadena Air Base, Japan."

-- Add new columns (group and wing are optional — users may omit them)
ALTER TABLE decoration_shells
  ADD COLUMN IF NOT EXISTS office       TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS squadron     TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS group_name   TEXT NOT NULL DEFAULT '',  -- "group" is reserved in SQL
  ADD COLUMN IF NOT EXISTS wing         TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS base_name    TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS location     TEXT NOT NULL DEFAULT '';

-- Migrate any existing "unit" data into the office field so nothing is lost
UPDATE decoration_shells
  SET office = unit
  WHERE unit IS NOT NULL AND unit <> '';
