// Enlisted Ranks
export type EnlistedRank =
  | "AB"
  | "Amn"
  | "A1C"
  | "SrA"
  | "SSgt"
  | "TSgt"
  | "MSgt"
  | "SMSgt"
  | "CMSgt";

// Officer Ranks
export type OfficerRank =
  | "2d Lt"
  | "1st Lt"
  | "Capt"
  | "Maj"
  | "Lt Col"
  | "Col"
  | "Brig Gen"
  | "Maj Gen"
  | "Lt Gen"
  | "Gen";

// All Ranks (Enlisted + Officer + Civilian)
export type Rank = EnlistedRank | OfficerRank | "Civilian";

export type UserRole = "member" | "admin";
export type WritingStyle = "personal" | "community" | "chain_of_command";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
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

// Assessment scores structure for accomplishments
export interface AccomplishmentMPARelevancy {
  executing_mission: number; // 0-100
  leading_people: number;
  managing_resources: number;
  improving_unit: number;
}

export interface AccomplishmentQualityIndicators {
  action_clarity: number; // 0-100 - How clearly the action is described
  impact_significance: number; // Significance of the impact
  metrics_quality: number; // Quality of quantifiable metrics
  scope_definition: number; // How well scope/scale is defined
  [key: string]: number; // Extensible for future indicators
}

export interface AccomplishmentAssessmentScores {
  mpa_relevancy: AccomplishmentMPARelevancy;
  overall_score: number; // 0-100 composite quality score
  quality_indicators: AccomplishmentQualityIndicators;
  primary_mpa: string; // Best matching MPA key
  secondary_mpa: string | null; // Second best match if close
}

export interface Accomplishment {
  id: string;
  user_id: string;
  created_by: string; // Who entered this (supervisor or self)
  team_member_id: string | null; // For managed members
  date: string;
  action_verb: string;
  details: string;
  impact: string | null; // Optional impact/result
  metrics: string | null;
  mpa: string;
  tags: string[];
  cycle_year: number;
  // Assessment fields (populated by AI after save)
  assessment_scores: AccomplishmentAssessmentScores | null;
  assessed_at: string | null;
  assessment_model: string | null;
  created_at: string;
  updated_at: string;
}

// Accomplishment Comments / Request for Information
export interface AccomplishmentComment {
  id: string;
  accomplishment_id: string;
  author_id: string;
  comment_text: string;
  is_resolved: boolean;
  resolved_at: string | null;
  resolved_by: string | null;
  visible_to: string[] | null; // Array of user IDs who can see private comments
  created_at: string;
  updated_at: string;
}

// Comment with author info and visibility details
export interface AccomplishmentCommentWithAuthor extends AccomplishmentComment {
  author_name: string | null;
  author_rank: Rank | null;
  author_avatar_url: string | null;
  resolved_by_name: string | null;
  resolved_by_rank: Rank | null;
  visible_to_names: string[]; // Names of users who can see (for display)
}

// Chain member for recipient selection in private comments
export interface ChainMember {
  user_id: string;
  full_name: string;
  rank: Rank | null;
  is_owner: boolean;
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

export type WinLevel = "squadron" | "group" | "wing" | "tenant_unit" | "haf";

// Award Win Level - levels at which an award package can win
export type AwardWinLevel = "flight" | "squadron" | "tenant_unit" | "group" | "wing" | "haf" | "12_oay";

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
  // Enhanced metadata fields
  applicable_mpas: string[]; // Array of MPA keys this statement could apply to (EPB multi-tagging)
  award_category: string | null; // 1206 category for award statements
  is_winning_package: boolean; // Whether this was part of a winning award package
  win_level: WinLevel | null; // Level at which the award was won
  use_as_llm_example: boolean; // Include as example in LLM prompts
  source_epb_shell_id: string | null; // Reference to the EPB shell this statement was archived from
  created_at: string;
  updated_at: string;
}

export interface CommunityStatement {
  id: string;
  contributor_id: string;
  refined_statement_id: string | null;
  source_statement_id: string | null;
  mpa: string;
  afsc: string;
  rank: Rank;
  statement: string;
  upvotes: number;
  downvotes: number;
  average_rating: number;
  rating_count: number;
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
  // Enhanced metadata fields
  applicable_mpas: string[];
  award_category: string | null;
  is_winning_package: boolean;
  win_level: WinLevel | null;
  use_as_llm_example: boolean;
  source_epb_shell_id: string | null;
  created_at: string;
  updated_at: string;
  share_type: ShareType;
  shared_with_id: string | null;
  share_id: string;
  owner_name: string | null;
  owner_rank: Rank | null;
}

// Archived EPB view type (for library filtering)
export interface ArchivedEPBView {
  id: string;
  user_id: string;
  team_member_id: string | null;
  cycle_year: number;
  archive_name: string | null;
  archived_at: string;
  created_at: string;
  ratee_name: string | null;
  ratee_rank: Rank | null;
  statement_count: number;
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

// Supervisor expectations - private expectations set by supervisor for subordinate
export interface SupervisorExpectation {
  id: string;
  supervisor_id: string;
  subordinate_id: string | null;
  team_member_id: string | null;
  expectation_text: string;
  supervision_start_date: string;
  supervision_end_date: string | null;
  cycle_year: number;
  created_at: string;
  updated_at: string;
  // Joined fields
  supervisor_name?: string;
  supervisor_rank?: Rank | null;
}

// Feedback types for supervisor-subordinate feedback sessions
export type FeedbackType = 'initial' | 'midterm' | 'final';
export type FeedbackStatus = 'draft' | 'shared';

// Supervisor feedbacks - feedback sessions conducted by supervisor
export interface SupervisorFeedback {
  id: string;
  supervisor_id: string;
  subordinate_id: string | null;
  team_member_id: string | null;
  feedback_type: FeedbackType;
  cycle_year: number;
  content: string;
  reviewed_accomplishment_ids: string[];
  status: FeedbackStatus;
  shared_at: string | null;
  supervision_start_date: string;
  supervision_end_date: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  supervisor_name?: string;
  supervisor_rank?: Rank | null;
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
export type ManagedMemberStatus = "active" | "prior_subordinate" | "archived" | "pending_link";

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
  // OPB-specific settings (Officer Performance Brief)
  opb_system_prompt: string | null;
  opb_style_guidelines: string | null;
  // Decoration-specific settings
  decoration_system_prompt: string | null;
  decoration_style_guidelines: string | null;
  decoration_abbreviations: Abbreviation[];
  // Duty description prompt (present tense, scope/responsibility - separate from performance statements)
  duty_description_prompt: string | null;
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
export type AwardCategory = "snco" | "nco" | "amn" | "jr_tech" | "sr_tech" | "innovation" | "volunteer" | "team" | string;
export type AwardRequestStatus = "pending" | "approved" | "denied";
export type AwardQuarter = "Q1" | "Q2" | "Q3" | "Q4";

// User-customizable award categories
export interface UserAwardCategory {
  id: string;
  user_id: string;
  category_key: string;
  label: string;
  description: string | null;
  is_default: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

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

export type EPBShellStatus = 'active' | 'archived';

export interface EPBShell {
  id: string;
  user_id: string;
  team_member_id: string | null;
  created_by: string;
  cycle_year: number;
  multi_user_enabled: boolean; // Toggle for multi-user collaboration mode
  duty_description: string; // Description of member's duty position (max 450 chars)
  duty_description_complete: boolean; // Whether duty description is marked complete
  status: EPBShellStatus; // 'active' or 'archived'
  archived_at: string | null; // Timestamp when archived
  archive_name: string | null; // Custom name for the archived EPB
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

export interface DutyDescriptionSnapshot {
  id: string;
  shell_id: string;
  description_text: string;
  created_by: string | null;
  note: string | null;
  created_at: string;
}

export interface DutyDescriptionExample {
  id: string;
  shell_id: string;
  example_text: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

export interface DutyDescriptionTemplate {
  id: string;
  user_id: string;
  template_text: string;
  office_label: string | null;
  role_label: string | null;
  rank_label: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
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

export interface ShellFieldLock {
  field_key: string;
  user_id: string;
  user_name: string;
  user_rank: string | null;
  acquired_at: string;
  expires_at: string;
}

// ============================================
// AWARD SHELL TYPES (mirrors EPB Shell structure)
// ============================================

export type AwardPeriodType = 'annual' | 'quarterly' | 'special';

export interface AwardShell {
  id: string;
  user_id: string;
  team_member_id: string | null;
  created_by: string;
  cycle_year: number;
  award_level: AwardLevel;
  award_category: AwardCategory;
  sentences_per_statement: 2 | 3;
  // Award title/label
  title: string | null;
  // Award period fields
  award_period_type: AwardPeriodType;
  quarter: 1 | 2 | 3 | 4 | null;
  is_fiscal_year: boolean;
  period_start_date: string | null;
  period_end_date: string | null;
  // Team award fields
  is_team_award: boolean;
  // Win tracking fields
  is_winner: boolean;
  win_level: AwardWinLevel | null;
  won_at: string | null;
  generated_award_id: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  sections?: AwardShellSection[];
  owner_profile?: Profile;
  owner_team_member?: ManagedMember;
  creator_profile?: Profile;
  team_members?: AwardShellTeamMember[];
  wins?: AwardShellWin[];
}

// Team members nominated for a team award
export interface AwardShellTeamMember {
  id: string;
  shell_id: string;
  profile_id: string | null;
  team_member_id: string | null;
  added_by: string;
  created_at: string;
  // Joined fields
  profile?: Profile;
  team_member?: ManagedMember;
}

// Win levels for an award shell (awards can win at multiple levels over time)
export interface AwardShellWin {
  id: string;
  shell_id: string;
  win_level: AwardWinLevel;
  won_at: string;
  added_by: string;
  generated_award_id: string | null;
  created_at: string;
}

export interface AwardShellSection {
  id: string;
  shell_id: string;
  category: string; // 1206 category key
  slot_index: number;
  statement_text: string;
  source_type: 'actions' | 'custom';
  custom_context: string;
  selected_action_ids: string[];
  lines_per_statement: 2 | 3;
  last_edited_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  snapshots?: AwardShellSnapshot[];
}

export interface AwardShellSnapshot {
  id: string;
  section_id: string;
  statement_text: string;
  created_by: string | null;
  note: string | null;
  created_at: string;
}

export interface AwardShellShare {
  id: string;
  shell_id: string;
  owner_id: string;
  share_type: 'user';
  shared_with_id: string;
  created_at: string;
  // Joined fields
  shared_with_profile?: Profile;
}

// ============================================
// OPB SHELL TYPES (Officer Performance Brief)
// ============================================

export type OPBShellStatus = 'active' | 'archived';

export interface OPBShell {
  id: string;
  user_id: string;
  created_by: string;
  cycle_year: number;
  duty_description: string;
  duty_description_complete: boolean;
  status: OPBShellStatus;
  archived_at: string | null;
  archive_name: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  sections?: OPBShellSection[];
  owner_profile?: Profile;
  creator_profile?: Profile;
}

export interface OPBShellSection {
  id: string;
  shell_id: string;
  mpa: string;
  statement_text: string;
  is_complete: boolean;
  last_edited_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  snapshots?: OPBShellSnapshot[];
}

export interface OPBShellSnapshot {
  id: string;
  section_id: string;
  statement_text: string;
  created_by: string | null;
  note: string | null;
  created_at: string;
}

export interface OPBDutyDescriptionSnapshot {
  id: string;
  shell_id: string;
  description_text: string;
  created_by: string | null;
  note: string | null;
  created_at: string;
}

export interface OPBShellShare {
  id: string;
  shell_id: string;
  owner_id: string;
  share_type: 'user';
  shared_with_id: string;
  created_at: string;
  // Joined fields
  shared_with_profile?: Profile;
}

// ============================================
// DECORATION SHELL TYPES
// ============================================

export type DecorationAwardType = 'afam' | 'afcm' | 'msm' | 'lom' | 'bsm';

export type DecorationReason = 
  | 'meritorious_service'
  | 'outstanding_achievement'
  | 'act_of_courage'
  | 'retirement'
  | 'separation'
  | 'posthumous'
  | 'combat_meritorious'
  | 'combat_valor';

export type DecorationStatus = 'draft' | 'finalized';

export interface DecorationShell {
  id: string;
  user_id: string;
  team_member_id: string | null;
  created_by: string;
  award_type: DecorationAwardType;
  reason: DecorationReason;
  duty_title: string;
  unit: string; // legacy — kept for backward compat; prefer office
  office: string;
  squadron: string;
  group_name: string; // optional
  wing: string;       // optional
  base_name: string;
  location: string;   // state or country
  start_date: string | null;
  end_date: string | null;
  citation_text: string;
  selected_statement_ids: string[];
  statement_colors: Record<string, string>; // Map of statement ID to color ID
  status: DecorationStatus;
  created_at: string;
  updated_at: string;
  // Joined fields
  owner_profile?: Profile;
  owner_team_member?: ManagedMember;
  creator_profile?: Profile;
}

export interface DecorationShellShare {
  id: string;
  shell_id: string;
  owner_id: string;
  share_type: 'user';
  shared_with_id: string;
  created_at: string;
  // Joined fields
  shared_with_profile?: Profile;
}

// ============================================
// USER STYLE LEARNING TYPES
// ============================================

export type StyleExampleCategory = 
  | 'executing_mission'
  | 'leading_people'
  | 'managing_resources'
  | 'improving_unit'
  | 'whole_airman'
  | 'duty_description'
  | 'award_statement';

export type StyleFeedbackEventType =
  | 'revision_selected'
  | 'revision_copied'
  | 'statement_edited'
  | 'statement_finalized'
  | 'slider_used'
  | 'toggle_used';

export interface UserStyleProfile {
  id: string;
  user_id: string;
  // Style metrics (0-100)
  sentence_length_pref: number;
  verb_intensity_pref: number;
  abbreviation_pref: number;
  metrics_density_pref: number;
  formality_pref: number;
  // Version selection tracking
  version_1_count: number;
  version_2_count: number;
  version_3_count: number;
  version_other_count: number;
  // Learned preferences
  avg_aggressiveness: number;
  aggressiveness_samples: number;
  fill_to_max_ratio: number;
  fill_to_max_samples: number;
  // Quality indicators
  total_statements_analyzed: number;
  total_revisions_selected: number;
  total_manual_edits: number;
  // Metadata
  last_updated: string;
  created_at: string;
}

export interface UserStyleExample {
  id: string;
  user_id: string;
  category: StyleExampleCategory;
  statement_text: string;
  is_finalized: boolean;
  was_ai_assisted: boolean;
  edit_ratio: number;
  sequence_num: number;
  created_at: string;
}

export interface StyleFeedbackEvent {
  id: string;
  user_id: string;
  event_type: StyleFeedbackEventType;
  payload: Record<string, unknown>;
  processed: boolean;
  processed_at: string | null;
  created_at: string;
}

// Payload types for different feedback events
export interface RevisionSelectedPayload {
  version: number;
  total_versions: number;
  char_count: number;
  category: StyleExampleCategory;
  aggressiveness?: number;
  fill_to_max?: boolean;
}

export interface RevisionCopiedPayload {
  version: number;
  text: string;
  category: StyleExampleCategory;
}

export interface StatementEditedPayload {
  original: string;
  edited: string;
  edit_distance: number; // Levenshtein distance or similar
  category: StyleExampleCategory;
}

export interface StatementFinalizedPayload {
  text: string;
  category: StyleExampleCategory;
  was_ai_assisted: boolean;
  edit_ratio: number; // 0-100, how much was edited from AI output
}

export interface SliderUsedPayload {
  value: number; // 0-100
}

export interface ToggleUsedPayload {
  fill_to_max: boolean;
}

// ============================================
// PROJECTS SYSTEM TYPES
// ============================================

export interface ProjectStakeholder {
  name: string;
  title: string;
  role: string;
}

export interface ProjectMetrics {
  people_impacted?: number;
  [key: string]: unknown;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  scope: string | null;
  result: string | null;
  impact: string | null;
  key_stakeholders: ProjectStakeholder[];
  metrics: ProjectMetrics | null;
  cycle_year: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  // Joined fields
  members?: ProjectMember[];
  creator_profile?: Profile;
}

export interface ProjectMember {
  id: string;
  project_id: string;
  profile_id: string | null;
  team_member_id: string | null;
  is_owner: boolean;
  added_by: string;
  created_at: string;
  // Joined fields
  profile?: Profile;
  team_member?: ManagedMember;
  can_view_accomplishments?: boolean;
}

export interface AccomplishmentProject {
  id: string;
  accomplishment_id: string;
  project_id: string;
  created_at: string;
  // Joined fields
  project?: Project;
}

// JSON type for Supabase
type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      user_award_categories: {
        Row: {
          id: string;
          user_id: string;
          category_key: string;
          label: string;
          description: string | null;
          is_default: boolean;
          display_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          category_key: string;
          label: string;
          description?: string | null;
          is_default?: boolean;
          display_order?: number;
        };
        Update: {
          label?: string;
          description?: string | null;
          display_order?: number;
        };
      };
      award_shell_team_members: {
        Row: {
          id: string;
          shell_id: string;
          profile_id: string | null;
          team_member_id: string | null;
          added_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          shell_id: string;
          profile_id?: string | null;
          team_member_id?: string | null;
          added_by: string;
        };
        Update: never;
      };
      award_shell_wins: {
        Row: {
          id: string;
          shell_id: string;
          win_level: AwardWinLevel;
          won_at: string;
          added_by: string;
          generated_award_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          shell_id: string;
          win_level: AwardWinLevel;
          won_at?: string;
          added_by: string;
          generated_award_id?: string | null;
        };
        Update: {
          generated_award_id?: string | null;
        };
      };
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
          impact: string | null;
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
          impact?: string | null;
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
          impact?: string | null;
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
          average_rating: number;
          rating_count: number;
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
          average_rating?: number;
          rating_count?: number;
          is_approved?: boolean;
        };
        Update: {
          statement?: string;
          upvotes?: number;
          downvotes?: number;
          average_rating?: number;
          rating_count?: number;
          is_approved?: boolean;
        };
      };
      statement_votes: {
        Row: {
          id: string;
          user_id: string;
          statement_id: string;
          rating: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          statement_id: string;
          rating: number;
        };
        Update: {
          rating?: number;
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
      projects: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          scope: string | null;
          result: string | null;
          impact: string | null;
          key_stakeholders: ProjectStakeholder[];
          metrics: ProjectMetrics | null;
          cycle_year: number;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          scope?: string | null;
          result?: string | null;
          impact?: string | null;
          key_stakeholders?: ProjectStakeholder[];
          metrics?: ProjectMetrics | null;
          cycle_year?: number;
          created_by: string;
        };
        Update: {
          name?: string;
          description?: string | null;
          scope?: string | null;
          result?: string | null;
          impact?: string | null;
          key_stakeholders?: ProjectStakeholder[];
          metrics?: ProjectMetrics | null;
        };
      };
      project_members: {
        Row: {
          id: string;
          project_id: string;
          profile_id: string | null;
          team_member_id: string | null;
          is_owner: boolean;
          added_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          profile_id?: string | null;
          team_member_id?: string | null;
          is_owner?: boolean;
          added_by: string;
        };
        Update: {
          is_owner?: boolean;
        };
      };
      accomplishment_projects: {
        Row: {
          id: string;
          accomplishment_id: string;
          project_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          accomplishment_id: string;
          project_id: string;
        };
        Update: never;
      };
      decoration_shells: {
        Row: {
          id: string;
          user_id: string;
          team_member_id: string | null;
          created_by: string;
          award_type: DecorationAwardType;
          reason: DecorationReason;
          duty_title: string;
          unit: string;
          office: string;
          squadron: string;
          group_name: string;
          wing: string;
          base_name: string;
          location: string;
          start_date: string | null;
          end_date: string | null;
          citation_text: string;
          selected_statement_ids: string[];
          status: DecorationStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          team_member_id?: string | null;
          created_by: string;
          award_type: DecorationAwardType;
          reason?: DecorationReason;
          duty_title?: string;
          unit?: string;
          office?: string;
          squadron?: string;
          group_name?: string;
          wing?: string;
          base_name?: string;
          location?: string;
          start_date?: string | null;
          end_date?: string | null;
          citation_text?: string;
          selected_statement_ids?: string[];
          status?: DecorationStatus;
        };
        Update: {
          award_type?: DecorationAwardType;
          reason?: DecorationReason;
          duty_title?: string;
          unit?: string;
          office?: string;
          squadron?: string;
          group_name?: string;
          wing?: string;
          base_name?: string;
          location?: string;
          start_date?: string | null;
          end_date?: string | null;
          citation_text?: string;
          selected_statement_ids?: string[];
          status?: DecorationStatus;
        };
      };
      decoration_shell_shares: {
        Row: {
          id: string;
          shell_id: string;
          owner_id: string;
          share_type: 'user';
          shared_with_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          shell_id: string;
          owner_id: string;
          share_type: 'user';
          shared_with_id: string;
        };
        Update: never;
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
      get_visible_managed_members: {
        Args: { viewer_uuid: string };
        Returns: {
          id: string;
          supervisor_id: string;
          parent_profile_id: string | null;
          parent_team_member_id: string | null;
          linked_user_id: string | null;
          original_profile_id: string | null;
          full_name: string;
          email: string | null;
          rank: string | null;
          afsc: string | null;
          unit: string | null;
          is_placeholder: boolean;
          member_status: ManagedMemberStatus;
          supervision_start_date: string | null;
          supervision_end_date: string | null;
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
      is_project_member: {
        Args: { p_project_id: string; p_user_id: string };
        Returns: boolean;
      };
      is_project_owner: {
        Args: { p_project_id: string; p_user_id: string };
        Returns: boolean;
      };
      get_user_projects: {
        Args: { p_user_id: string };
        Returns: Project[];
      };
      get_project_members_with_visibility: {
        Args: { p_project_id: string; p_viewer_id: string };
        Returns: {
          member_id: string;
          profile_id: string | null;
          team_member_id: string | null;
          is_owner: boolean;
          full_name: string;
          rank: string | null;
          afsc: string | null;
          can_view_accomplishments: boolean;
        }[];
      };
      initialize_user_award_categories: {
        Args: { p_user_id: string };
        Returns: UserAwardCategory[];
      };
      add_award_shell_win_level: {
        Args: { p_shell_id: string; p_win_level: AwardWinLevel };
        Returns: string;
      };
      remove_award_shell_win_level: {
        Args: { p_shell_id: string; p_win_level: AwardWinLevel };
        Returns: boolean;
      };
    };
    Enums: {
      user_rank: Rank;
      user_role: UserRole;
    };
  };
}
