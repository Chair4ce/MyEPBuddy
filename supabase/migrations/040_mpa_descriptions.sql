-- Add MPA descriptions to user LLM settings
-- These descriptions help the AI understand what each MPA covers and provide relevancy scoring

ALTER TABLE user_llm_settings
ADD COLUMN mpa_descriptions JSONB NOT NULL DEFAULT '{
  "executing_mission": {
    "title": "Executing the Mission",
    "description": "Effectively uses knowledge, initiative, and adaptability to produce timely, high quality, quantity results to positively impact the mission.",
    "sub_competencies": {
      "job_proficiency": "Demonstrates knowledge and professional skill in assigned duties, achieving positive results and impact in support of the mission.",
      "adaptability": "Adjusts to changing conditions, to include plans, information, processes, requirements and obstacles in accomplishing the mission.",
      "initiative": "Assesses and takes independent or directed action to complete a task or mission that influences the mission or organization."
    }
  },
  "leading_people": {
    "title": "Leading People",
    "description": "Fosters cohesive teams, effectively communicates, and uses emotional intelligence to take care of people and accomplish the mission.",
    "sub_competencies": {
      "inclusion_teamwork": "Collaborates effectively with others to achieve an inclusive climate in pursuit of a common goal or to complete a task or mission.",
      "emotional_intelligence": "Exercises self-awareness, manages their own emotions effectively; demonstrates an understanding of others'' emotions, and appropriately manages relationships.",
      "communication": "Articulates information in a clear and timely manner, both verbally and non-verbally, through active listening and messaging tailored to the appropriate audience."
    }
  },
  "managing_resources": {
    "title": "Managing Resources",
    "description": "Manages assigned resources effectively and takes responsibility for actions, behaviors to maximize organizational performance.",
    "sub_competencies": {
      "stewardship": "Demonstrates responsible management of assigned resources, which may include time, equipment, people, funds and/or facilities.",
      "accountability": "Takes responsibility for the actions and behaviors of self and/or team; demonstrates reliability and transparency."
    }
  },
  "improving_unit": {
    "title": "Improving the Unit",
    "description": "Demonstrates critical thinking and fosters innovation to find creative solutions and improve mission execution.",
    "sub_competencies": {
      "decision_making": "Makes well-informed, effective and timely decisions under one''s control that weigh constraints, risks, and benefits.",
      "innovation": "Thinks creatively about different ways to solve problems, implements improvements and demonstrates calculated risk-taking."
    }
  },
  "hlr_assessment": {
    "title": "Higher Level Reviewer Assessment",
    "description": "Commander''s holistic assessment synthesizing overall performance across all MPAs into a strategic endorsement.",
    "sub_competencies": {}
  }
}'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN user_llm_settings.mpa_descriptions IS 'User-customizable MPA descriptions with sub-competencies. Used to guide AI generation and calculate relevancy scores.';





