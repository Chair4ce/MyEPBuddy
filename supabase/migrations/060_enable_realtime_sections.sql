-- Enable realtime for epb_shell_sections table
-- This allows live updates of statement text between users viewing the same EPB

-- First check if the table exists and add it to the publication
DO $$
BEGIN
  -- Enable realtime for epb_shell_sections
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'epb_shell_sections'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE epb_shell_sections;
  END IF;
END $$;

COMMENT ON TABLE epb_shell_sections IS 'EPB shell sections with realtime enabled for live text sync between viewers';

