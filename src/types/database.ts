export type Rank =
  | "AB"
  | "Amn"
  | "A1C"
  | "SrA"
  | "SSgt"
  | "TSgt"
  | "MSgt"
  | "SMSgt"
  | "CMSgt"
  | "Civilian";

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
  created_by: string; // Who entered this (supervisor or self)
  team_member_id: string | null; // For managed members
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
  enable_collaboration: boolean;
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

export type StatementType = 'epb' | 'award';

export interface StatementHistory {
  id: string;
  user_id: string;
  ratee_id: string;
  team_member_id: string | null; // For managed members
  mpa: string;
  afsc: string;
  rank: Rank;
  original_statement: string;
  model_used: string;
  cycle_year: number;
  statement_type: StatementType;
  created_at: string;
}

export interface RefinedStatement {
  id: string;
  user_id: string;
  created_by: string | null; // Who created this (supervisor or self)
  history_id: string | null;
  team_member_id: string | null; // For managed members
  mpa: string;
  afsc: string;
  rank: Rank;
  statement: string;
  cycle_year: number;
  statement_type: StatementType;
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

export type ShareType = "user" | "team" | "community";

export interface StatementShare {
  id: string;
  statement_id: string;
  owner_id: string;
  share_type: ShareType;
  shared_with_id: string | null;
  created_at: string;
}

export interface SharedStatementView {
  id: string;
  owner_id: string;
  mpa: string;
  afsc: string;
  rank: Rank;
  statement: string;
  cycle_year: number;
  statement_type: StatementType;
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
  share_type: ShareType;
  shared_with_id: string | null;
  share_id: string;
  owner_name: string | null;
  owner_rank: Rank | null;
}

export interface Acronym {
  acronym: string;
  definition: string;
}

export interface Abbreviation {
  word: string;
  abbreviation: string;
}

// Team history - tracks supervisor changes over time
export interface TeamHistory {
  id: string;
  subordinate_id: string;
  supervisor_id: string;
  started_at: string;
  ended_at: string | null; // NULL = active/current relationship
  created_at: string;
}

// Pending managed account links - when user signs up with matching email
export interface PendingManagedLink {
  id: string;
  user_id: string;
  team_member_id: string;
  status: "pending" | "accepted" | "rejected";
  created_at: string;
  responded_at: string | null;
}

// Managed Team Member (placeholder subordinate without an account)
export type ManagedMemberStatus = "active" | "prior_subordinate" | "archived";

export interface ManagedMember {
  id: string;
  supervisor_id: string;
  parent_profile_id: string | null; // Who this member reports to (real profile)
  parent_team_member_id: string | null; // Who this member reports to (managed member)
  linked_user_id: string | null;
  original_profile_id: string | null; // If prior_subordinate, the original real user
  full_name: string;
  email: string | null;
  rank: Rank | null;
  afsc: string | null;
  unit: string | null;
  is_placeholder: boolean;
  member_status: ManagedMemberStatus;
  supervision_start_date: string | null;
  supervision_end_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface PendingPriorDataReview {
  id: string;
  subordinate_id: string;
  supervisor_id: string;
  prior_team_member_id: string;
  entry_count: number;
  statement_count: number;
  status: "pending" | "accepted" | "rejected";
  created_at: string;
  resolved_at: string | null;
  // Joined data
  supervisor?: Profile;
}

// Award sentences per category configuration
export interface AwardSentencesPerCategory {
  executing_mission: number;
  leading_people: number;
  improving_unit: number;
  managing_resources: number;
}

// MPA Description with sub-competencies for relevancy scoring
export interface MPASubCompetency {
  [key: string]: string;
}

export interface MPADescription {
  title: string;
  description: string;
  sub_competencies: MPASubCompetency;
}

export type MPADescriptions = Record<string, MPADescription>;

export interface UserLLMSettings {
  id: string;
  user_id: string;
  max_characters_per_statement: number;
  max_example_statements: number;
  scod_date: string;
  current_cycle_year: number;
  major_graded_areas: MajorGradedArea[];
  rank_verb_progression: RankVerbProgression;
  style_guidelines: string;
  base_system_prompt: string;
  acronyms: Acronym[];
  abbreviations: Abbreviation[];
  // MPA descriptions with sub-competencies for AI guidance
  mpa_descriptions: MPADescriptions;
  // Award-specific settings (AF Form 1206)
  award_system_prompt: string;
  award_abbreviations: Abbreviation[];
  award_style_guidelines: string;
  award_sentences_per_category: AwardSentencesPerCategory;
  award_period_text: string | null;
  created_at: string;
  updated_at: string;
}

// Workspace Collaboration Types
export interface WorkspaceSession {
  id: string;
  host_user_id: string;
  session_code: string;
  workspace_state: WorkspaceState;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  expires_at: string;
  // Joined fields
  host_profile?: Profile;
}

export interface WorkspaceSnapshot {
  id: string;
  statement: string;
  timestamp: string; // ISO string for JSON serialization
}

export interface WorkspaceState {
  draftStatement: string;
  selectedMpa: string;
  maxCharLimit: number;
  cycleYear: number;
  selectedSources: {
    id: string;
    statement: string;
    mpa: string;
    source: "my" | "shared" | "community";
  }[];
  snapshots?: WorkspaceSnapshot[];
}

export interface WorkspaceSessionParticipant {
  id: string;
  session_id: string;
  user_id: string;
  joined_at: string;
  left_at: string | null;
  is_host: boolean;
  // Joined fields
  profile?: Profile;
}

// ============================================
// AWARDS SYSTEM TYPES
// ============================================

export type AwardType = "coin" | "quarterly" | "annual" | "special";
export type AwardLevel = "squadron" | "group" | "wing" | "majcom" | "haf";
export type AwardCategory = "snco" | "nco" | "amn" | "jr_tech" | "sr_tech" | "innovation" | "volunteer" | "team";
export type AwardRequestStatus = "pending" | "approved" | "denied";
export type AwardQuarter = "Q1" | "Q2" | "Q3" | "Q4";

export interface Award {
  id: string;
  recipient_profile_id: string | null;
  recipient_team_member_id: string | null;
  created_by: string;
  supervisor_id: string;
  award_type: AwardType;
  award_name: string | null;
  coin_presenter: string | null;
  coin_description: string | null;
  coin_date: string | null;
  quarter: AwardQuarter | null;
  award_year: number | null;
  period_start: string | null;
  period_end: string | null;
  award_level: AwardLevel | null;
  award_category: AwardCategory | null;
  is_team_award: boolean;
  cycle_year: number;
  created_at: string;
  updated_at: string;
  // Joined fields
  recipient_profile?: Profile;
  recipient_team_member?: ManagedMember;
  team_members?: AwardTeamMember[];
}

export interface AwardTeamMember {
  id: string;
  award_id: string;
  profile_id: string | null;
  team_member_id: string | null;
  created_at: string;
  // Joined fields
  profile?: Profile;
  team_member?: ManagedMember;
}

export interface AwardRequest {
  id: string;
  requester_id: string;
  approver_id: string;
  recipient_profile_id: string | null;
  recipient_team_member_id: string | null;
  status: AwardRequestStatus;
  reviewed_at: string | null;
  denial_reason: string | null;
  award_type: AwardType;
  award_name: string | null;
  coin_presenter: string | null;
  coin_description: string | null;
  coin_date: string | null;
  quarter: AwardQuarter | null;
  award_year: number | null;
  period_start: string | null;
  period_end: string | null;
  award_level: AwardLevel | null;
  award_category: AwardCategory | null;
  is_team_award: boolean;
  cycle_year: number;
  created_at: string;
  updated_at: string;
  // Joined fields
  requester?: Profile;
  approver?: Profile;
  recipient_profile?: Profile;
  recipient_team_member?: ManagedMember;
}

export interface AwardCatalog {
  id: string;
  name: string;
  short_name: string | null;
  description: string | null;
  award_type: AwardType;
  is_team_eligible: boolean;
  is_active: boolean;
  display_order: number;
  created_at: string;
}

// ============================================
// EPB SHELL SYSTEM TYPES
// ============================================

export interface EPBShell {
  id: string;
  user_id: string;
  team_member_id: string | null;
  created_by: string;
  cycle_year: number;
  multi_user_enabled: boolean; // Toggle for multi-user collaboration mode
  created_at: string;
  updated_at: string;
  // Joined fields
  sections?: EPBShellSection[];
  owner_profile?: Profile;
  owner_team_member?: ManagedMember;
  creator_profile?: Profile;
}

export interface EPBShellSection {
  id: string;
  shell_id: string;
  mpa: string;
  statement_text: string;
  is_complete: boolean;
  last_edited_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  snapshots?: EPBShellSnapshot[];
}

export interface EPBShellSnapshot {
  id: string;
  section_id: string;
  statement_text: string;
  created_by: string | null;
  note: string | null;
  created_at: string;
}

export interface EPBSavedExample {
  id: string;
  shell_id: string;
  section_id: string;
  mpa: string;
  statement_text: string;
  created_by: string;
  created_by_name: string | null;
  created_by_rank: string | null;
  note: string | null;
  created_at: string;
}

export interface EPBShellShare {
  id: string;
  shell_id: string;
  owner_id: string;
  share_type: 'user';
  shared_with_id: string;
  created_at: string;
  // Joined fields
  shared_with_profile?: Profile;
}

export interface EPBSectionLock {
  section_id: string;
  mpa_key: string;
  user_id: string;
  user_name: string;
  user_rank: string | null;
  acquired_at: string;
  expires_at: string;
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
          team_member_id: string | null;
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
          team_member_id?: string | null;
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
          team_member_id?: string | null;
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
      team_members: {
        Row: {
          id: string;
          supervisor_id: string;
          parent_profile_id: string | null;
          parent_team_member_id: string | null;
          linked_user_id: string | null;
          full_name: string;
          email: string | null;
          rank: string | null;
          afsc: string | null;
          unit: string | null;
          is_placeholder: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          supervisor_id: string;
          parent_profile_id?: string | null;
          parent_team_member_id?: string | null;
          linked_user_id?: string | null;
          full_name: string;
          email?: string | null;
          rank?: string | null;
          afsc?: string | null;
          unit?: string | null;
          is_placeholder?: boolean;
        };
        Update: {
          parent_profile_id?: string | null;
          parent_team_member_id?: string | null;
          linked_user_id?: string | null;
          full_name?: string;
          email?: string | null;
          rank?: string | null;
          afsc?: string | null;
          unit?: string | null;
          is_placeholder?: boolean;
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
      user_feedback: {
        Row: {
          id: string;
          user_id: string | null;
          feature: string;
          feedback: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          feature: string;
          feedback: string;
          created_at?: string;
        };
        Update: {
          feature?: string;
          feedback?: string;
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
          cycle_year: number;
          created_by: string | null;
          team_member_id: string | null;
          statement_type: string;
          source_accomplishment_ids: string[] | null;
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
          cycle_year?: number;
          created_by?: string;
          team_member_id?: string | null;
          statement_type?: string;
          source_accomplishment_ids?: string[] | null;
        };
        Update: {
          statement?: string;
          is_favorite?: boolean;
          statement_type?: string;
          source_accomplishment_ids?: string[] | null;
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
      statement_shares: {
        Row: {
          id: string;
          statement_id: string;
          owner_id: string;
          share_type: "user" | "team" | "community";
          shared_with_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          statement_id: string;
          owner_id: string;
          share_type: "user" | "team" | "community";
          shared_with_id?: string | null;
        };
        Update: never;
      };
      pending_managed_links: {
        Row: {
          id: string;
          user_id: string;
          team_member_id: string;
          status: "pending" | "accepted" | "rejected";
          created_at: string;
          responded_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          team_member_id: string;
          status?: "pending" | "accepted" | "rejected";
        };
        Update: {
          status?: "pending" | "accepted" | "rejected";
          responded_at?: string | null;
        };
      };
      team_history: {
        Row: {
          id: string;
          subordinate_id: string;
          supervisor_id: string;
          started_at: string;
          ended_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          subordinate_id: string;
          supervisor_id: string;
          started_at?: string;
          ended_at?: string | null;
        };
        Update: {
          ended_at?: string | null;
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
      accept_pending_managed_link: {
        Args: { link_id: string };
        Returns: boolean;
      };
      reject_pending_managed_link: {
        Args: { link_id: string };
        Returns: boolean;
      };
      get_all_managed_members: {
        Args: { supervisor_uuid: string };
        Returns: {
          id: string;
          supervisor_id: string;
          parent_profile_id: string | null;
          parent_team_member_id: string | null;
          linked_user_id: string | null;
          full_name: string;
          email: string | null;
          rank: string | null;
          afsc: string | null;
          unit: string | null;
          is_placeholder: boolean;
          member_status: ManagedMemberStatus;
          created_at: string;
          updated_at: string;
        }[];
      };
      archive_prior_subordinate: {
        Args: { team_member_id: string };
        Returns: { success: boolean };
      };
      delete_prior_subordinate: {
        Args: { p_team_member_id: string; p_delete_data?: boolean };
        Returns: { success: boolean; entries_deleted: number; statements_deleted: number };
      };
      sync_managed_account_data: {
        Args: { link_id: string };
        Returns: { success: boolean };
      };
      accept_supervisor_from_link: {
        Args: { link_id: string };
        Returns: { success: boolean };
      };
      dismiss_pending_link: {
        Args: { link_id: string };
        Returns: { success: boolean };
      };
      complete_pending_link: {
        Args: { link_id: string };
        Returns: { success: boolean };
      };
      accept_prior_data_review: {
        Args: { p_review_id: string };
        Returns: { success: boolean; entries_transferred: number; statements_transferred: number };
      };
      reject_prior_data_review: {
        Args: { p_review_id: string };
        Returns: { success: boolean };
      };
    };
    Enums: {
      user_rank: Rank;
      user_role: UserRole;
    };
  };
}
