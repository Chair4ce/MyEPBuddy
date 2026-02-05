-- Migration: Split full_name into first_name and last_name
-- This allows proper display of "Rank LastName" format

-- Add the new columns
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS first_name text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_name text;

-- Migrate existing data: split full_name into first and last name
-- Assumes format "FirstName LastName" or "FirstName MiddleName LastName"
UPDATE profiles
SET 
  first_name = CASE 
    WHEN full_name IS NOT NULL AND full_name != '' THEN 
      split_part(full_name, ' ', 1)
    ELSE NULL
  END,
  last_name = CASE 
    WHEN full_name IS NOT NULL AND full_name != '' AND position(' ' in full_name) > 0 THEN 
      -- Get everything after the first space (handles middle names)
      substring(full_name from position(' ' in full_name) + 1)
    ELSE NULL
  END
WHERE first_name IS NULL OR last_name IS NULL;

-- Add comments for documentation
COMMENT ON COLUMN profiles.first_name IS 'User first name';
COMMENT ON COLUMN profiles.last_name IS 'User last name (may include middle name)';
