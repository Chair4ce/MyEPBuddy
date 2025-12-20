export type Rank =
  | "AB"
  | "Amn"
  | "A1C"
  | "SrA"
  | "SSgt"
  | "TSgt"
  | "MSgt"
  | "SMSgt"
  | "CMSgt";

export type UserRole = "member" | "admin";
export type WritingStyle = "personal" | "community" | "hybrid";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  rank: Rank | null;
  afsc: string | null;
  unit: string | null;
  role: UserRole;
  supervisor_id: string | null;
  avatar_url: string | null;
  writing_style: WritingStyle;
  terms_accepted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Team {
  id: string;
  supervisor_id: string;
  subordinate_id: string;
  created_at: string;
}

export type TeamRequestType = "supervise" | "be_supervised";
export type TeamRequestStatus = "pending" | "accepted" | "declined";

export interface TeamRequest {
  id: string;
  requester_id: string;
  target_id: string;
  request_type: TeamRequestType;
  status: TeamRequestStatus;
  message: string | null;
  created_at: string;
  responded_at: string | null;
  // Joined fields
  requester?: Profile;
  target?: Profile;
}

export interface Accomplishment {
  id: string;
  user_id: string;
  created_by: string;
  date: string;
  action_verb: string;
  details: string;
  impact: string;
  metrics: string | null;
  mpa: string;
  tags: string[];
  cycle_year: number;
  created_at: string;
  updated_at: string;
}

export interface MajorGradedArea {
  key: string;
  label: string;
}

export interface RankVerbProgression {
  [rank: string]: {
    primary: string[];
    secondary: string[];
  };
}

export interface EPBConfig {
  id: number;
  max_characters_per_statement: number;
  scod_date: string;
  current_cycle_year: number;
  major_graded_areas: MajorGradedArea[];
  style_guidelines: string;
  rank_verb_progression: RankVerbProgression;
  base_system_prompt: string;
  updated_at: string;
}

export interface UserAPIKeys {
  id: string;
  user_id: string;
  openai_key: string | null;
  anthropic_key: string | null;
  google_key: string | null;
  grok_key: string | null;
  created_at: string;
  updated_at: string;
}

export interface StatementHistory {
  id: string;
  user_id: string;
  ratee_id: string;
  mpa: string;
  afsc: string;
  rank: Rank;
  original_statement: string;
  model_used: string;
  cycle_year: number;
  created_at: string;
}

export interface RefinedStatement {
  id: string;
  user_id: string;
  history_id: string | null;
  mpa: string;
  afsc: string;
  rank: Rank;
  statement: string;
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
}

export interface CommunityStatement {
  id: string;
  contributor_id: string;
  refined_statement_id: string | null;
  mpa: string;
  afsc: string;
  rank: Rank;
  statement: string;
  upvotes: number;
  downvotes: number;
  is_approved: boolean;
  created_at: string;
}

export interface Acronym {
  acronym: string;
  definition: string;
}

export interface Abbreviation {
  word: string;
  abbreviation: string;
}

export interface UserLLMSettings {
  id: string;
  user_id: string;
  max_characters_per_statement: number;
  scod_date: string;
  current_cycle_year: number;
  major_graded_areas: MajorGradedArea[];
  rank_verb_progression: RankVerbProgression;
  style_guidelines: string;
  base_system_prompt: string;
  acronyms: Acronym[];
  abbreviations: Abbreviation[];
  created_at: string;
  updated_at: string;
}

// JSON type for Supabase
type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          rank: string | null;
          afsc: string | null;
          unit: string | null;
          role: string;
          supervisor_id: string | null;
          avatar_url: string | null;
          writing_style: string;
          terms_accepted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          rank?: string | null;
          afsc?: string | null;
          unit?: string | null;
          role?: string;
          supervisor_id?: string | null;
          avatar_url?: string | null;
          writing_style?: string;
          terms_accepted_at?: string | null;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          rank?: string | null;
          afsc?: string | null;
          unit?: string | null;
          role?: string;
          supervisor_id?: string | null;
          avatar_url?: string | null;
          writing_style?: string;
          terms_accepted_at?: string | null;
        };
      };
      teams: {
        Row: {
          id: string;
          supervisor_id: string;
          subordinate_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          supervisor_id: string;
          subordinate_id: string;
        };
        Update: {
          supervisor_id?: string;
          subordinate_id?: string;
        };
      };
      accomplishments: {
        Row: {
          id: string;
          user_id: string;
          created_by: string;
          date: string;
          action_verb: string;
          details: string;
          impact: string;
          metrics: string | null;
          mpa: string;
          tags: Json;
          cycle_year: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          created_by: string;
          date: string;
          action_verb: string;
          details: string;
          impact: string;
          metrics?: string | null;
          mpa: string;
          tags?: Json;
          cycle_year: number;
        };
        Update: {
          user_id?: string;
          created_by?: string;
          date?: string;
          action_verb?: string;
          details?: string;
          impact?: string;
          metrics?: string | null;
          mpa?: string;
          tags?: Json;
          cycle_year?: number;
        };
      };
      epb_config: {
        Row: {
          id: number;
          max_characters_per_statement: number;
          scod_date: string;
          current_cycle_year: number;
          major_graded_areas: Json;
          style_guidelines: string;
          rank_verb_progression: Json;
          base_system_prompt: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          max_characters_per_statement?: number;
          scod_date?: string;
          current_cycle_year?: number;
          major_graded_areas?: Json;
          style_guidelines?: string;
          rank_verb_progression?: Json;
          base_system_prompt?: string;
        };
        Update: {
          max_characters_per_statement?: number;
          scod_date?: string;
          current_cycle_year?: number;
          major_graded_areas?: Json;
          style_guidelines?: string;
          rank_verb_progression?: Json;
          base_system_prompt?: string;
        };
      };
      user_api_keys: {
        Row: {
          id: string;
          user_id: string;
          openai_key: string | null;
          anthropic_key: string | null;
          google_key: string | null;
          grok_key: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          openai_key?: string | null;
          anthropic_key?: string | null;
          google_key?: string | null;
          grok_key?: string | null;
        };
        Update: {
          openai_key?: string | null;
          anthropic_key?: string | null;
          google_key?: string | null;
          grok_key?: string | null;
        };
      };
      statement_history: {
        Row: {
          id: string;
          user_id: string;
          ratee_id: string;
          mpa: string;
          afsc: string;
          rank: string;
          original_statement: string;
          model_used: string;
          cycle_year: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          ratee_id: string;
          mpa: string;
          afsc: string;
          rank: string;
          original_statement: string;
          model_used: string;
          cycle_year: number;
        };
        Update: never;
      };
      refined_statements: {
        Row: {
          id: string;
          user_id: string;
          history_id: string | null;
          mpa: string;
          afsc: string;
          rank: string;
          statement: string;
          is_favorite: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          history_id?: string | null;
          mpa: string;
          afsc: string;
          rank: string;
          statement: string;
          is_favorite?: boolean;
        };
        Update: {
          statement?: string;
          is_favorite?: boolean;
        };
      };
      community_statements: {
        Row: {
          id: string;
          contributor_id: string;
          refined_statement_id: string | null;
          mpa: string;
          afsc: string;
          rank: string;
          statement: string;
          upvotes: number;
          downvotes: number;
          is_approved: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          contributor_id: string;
          refined_statement_id?: string | null;
          mpa: string;
          afsc: string;
          rank: string;
          statement: string;
          upvotes?: number;
          downvotes?: number;
          is_approved?: boolean;
        };
        Update: {
          statement?: string;
          upvotes?: number;
          downvotes?: number;
          is_approved?: boolean;
        };
      };
      statement_votes: {
        Row: {
          id: string;
          user_id: string;
          statement_id: string;
          vote_type: "up" | "down";
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          statement_id: string;
          vote_type: "up" | "down";
        };
        Update: {
          vote_type?: "up" | "down";
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      get_subordinate_chain: {
        Args: { supervisor_uuid: string };
        Returns: { subordinate_id: string; depth: number }[];
      };
      get_supervisor_chain: {
        Args: { subordinate_uuid: string };
        Returns: { supervisor_id: string; depth: number }[];
      };
    };
    Enums: {
      user_rank: Rank;
      user_role: UserRole;
    };
  };
}
