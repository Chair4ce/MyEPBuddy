-- Update existing profiles to use 'member' role
UPDATE profiles SET role = 'member' WHERE role IN ('supervisor', 'subordinate');





