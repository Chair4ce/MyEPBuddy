-- Add award-specific rank verb progression to user_llm_settings
-- Separate from EPB rank_verb_progression so awards have independent verb configuration

ALTER TABLE user_llm_settings
ADD COLUMN IF NOT EXISTS award_rank_verb_progression JSONB NOT NULL DEFAULT '{
  "AB": {"primary": ["Assisted", "Supported", "Performed"], "secondary": ["Helped", "Contributed", "Participated"]},
  "Amn": {"primary": ["Assisted", "Supported", "Performed"], "secondary": ["Helped", "Contributed", "Executed"]},
  "A1C": {"primary": ["Executed", "Performed", "Supported"], "secondary": ["Assisted", "Contributed", "Maintained"]},
  "SrA": {"primary": ["Executed", "Coordinated", "Managed"], "secondary": ["Led", "Supervised", "Trained"]},
  "SSgt": {"primary": ["Led", "Managed", "Directed"], "secondary": ["Supervised", "Coordinated", "Developed"]},
  "TSgt": {"primary": ["Led", "Managed", "Directed"], "secondary": ["Drove", "Guided", "Championed"]},
  "MSgt": {"primary": ["Directed", "Drove", "Guided"], "secondary": ["Championed", "Transformed", "Pioneered"]},
  "SMSgt": {"primary": ["Drove", "Championed", "Transformed"], "secondary": ["Pioneered", "Modernized", "Elevated"]},
  "CMSgt": {"primary": ["Championed", "Transformed", "Pioneered"], "secondary": ["Modernized", "Institutionalized", "Shaped"]},
  "2d Lt": {"primary": ["Led", "Managed", "Coordinated"], "secondary": ["Supervised", "Executed", "Developed"]},
  "1st Lt": {"primary": ["Led", "Managed", "Directed"], "secondary": ["Coordinated", "Supervised", "Developed"]},
  "Capt": {"primary": ["Directed", "Led", "Managed"], "secondary": ["Drove", "Coordinated", "Championed"]},
  "Maj": {"primary": ["Directed", "Drove", "Guided"], "secondary": ["Championed", "Transformed", "Led"]},
  "Lt Col": {"primary": ["Drove", "Championed", "Guided"], "secondary": ["Transformed", "Directed", "Pioneered"]},
  "Col": {"primary": ["Championed", "Transformed", "Guided"], "secondary": ["Pioneered", "Shaped", "Directed"]},
  "Brig Gen": {"primary": ["Championed", "Transformed", "Pioneered"], "secondary": ["Shaped", "Institutionalized", "Modernized"]},
  "Maj Gen": {"primary": ["Transformed", "Pioneered", "Shaped"], "secondary": ["Institutionalized", "Modernized", "Championed"]},
  "Lt Gen": {"primary": ["Pioneered", "Shaped", "Institutionalized"], "secondary": ["Modernized", "Transformed", "Championed"]},
  "Gen": {"primary": ["Shaped", "Institutionalized", "Modernized"], "secondary": ["Pioneered", "Transformed", "Championed"]}
}'::jsonb;

COMMENT ON COLUMN user_llm_settings.award_rank_verb_progression IS 'Rank-specific action verb progression for Award (AF Form 1206) generation - independent from EPB verbs';
