import type { Rank, MajorGradedArea } from "@/types/database";

// Standard Major Performance Areas - AFI 36-2406
// These are the same for all users and should not be modified

// MPAs that users can log entries against (excludes HLR which is Commander's assessment)
export const ENTRY_MGAS: MajorGradedArea[] = [
  { key: "executing_mission", label: "Executing the Mission" },
  { key: "leading_people", label: "Leading People" },
  { key: "managing_resources", label: "Managing Resources" },
  { key: "improving_unit", label: "Improving the Unit" },
];

// All MPAs including HLR (for statement generation)
export const STANDARD_MGAS: MajorGradedArea[] = [
  ...ENTRY_MGAS,
  { key: "hlr_assessment", label: "Higher Level Reviewer Assessment" },
];

// MPA key to abbreviation mapping
export const MPA_ABBREVIATIONS: Record<string, string> = {
  executing_mission: "EM",
  leading_people: "LP",
  managing_resources: "MR",
  improving_unit: "IU",
  hlr_assessment: "HLR",
};

export const RANKS: { value: Rank; label: string }[] = [
  { value: "AB", label: "AB (Airman Basic)" },
  { value: "Amn", label: "Amn (Airman)" },
  { value: "A1C", label: "A1C (Airman First Class)" },
  { value: "SrA", label: "SrA (Senior Airman)" },
  { value: "SSgt", label: "SSgt (Staff Sergeant)" },
  { value: "TSgt", label: "TSgt (Technical Sergeant)" },
  { value: "MSgt", label: "MSgt (Master Sergeant)" },
  { value: "SMSgt", label: "SMSgt (Senior Master Sergeant)" },
  { value: "CMSgt", label: "CMSgt (Chief Master Sergeant)" },
];

export const SUPERVISOR_RANKS: Rank[] = ["SSgt", "TSgt", "MSgt", "SMSgt", "CMSgt"];

export const AI_MODELS = [
  {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "openai",
    description: "OpenAI's most capable model",
  },
  {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "openai",
    description: "Fast and cost-effective",
  },
  {
    id: "claude-sonnet-4-20250514",
    name: "Claude Sonnet 4",
    provider: "anthropic",
    description: "Anthropic's balanced model",
  },
  {
    id: "claude-3-5-haiku-20241022",
    name: "Claude 3.5 Haiku",
    provider: "anthropic",
    description: "Fast and efficient",
  },
  {
    id: "gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    provider: "google",
    description: "Google's latest fast model",
  },
  {
    id: "gemini-1.5-pro-latest",
    name: "Gemini 1.5 Pro",
    provider: "google",
    description: "Google's advanced model",
  },
  {
    id: "grok-2",
    name: "Grok 2",
    provider: "xai",
    description: "xAI's powerful model",
  },
] as const;

export type AIModel = (typeof AI_MODELS)[number];

export const DEFAULT_ACTION_VERBS = [
  "Led",
  "Managed",
  "Directed",
  "Coordinated",
  "Executed",
  "Spearheaded",
  "Championed",
  "Orchestrated",
  "Developed",
  "Implemented",
  "Established",
  "Transformed",
  "Pioneered",
  "Streamlined",
  "Optimized",
  "Enhanced",
  "Improved",
  "Supervised",
  "Trained",
  "Mentored",
  "Guided",
  "Supported",
  "Facilitated",
  "Analyzed",
  "Resolved",
];

export const MAX_STATEMENT_CHARACTERS = 350;

// ============================================
// AWARDS SYSTEM CONSTANTS
// ============================================

import type { AwardType, AwardLevel, AwardCategory, AwardQuarter } from "@/types/database";

export const AWARD_TYPES: { value: AwardType; label: string; description: string }[] = [
  { value: "coin", label: "Challenge Coin", description: "Coin presented by leadership" },
  { value: "quarterly", label: "Quarterly Award", description: "Quarterly recognition program" },
  { value: "annual", label: "Annual Award", description: "Annual recognition program" },
  { value: "special", label: "Special Award", description: "Named awards (Sijan, Levitow, etc.)" },
];

export const AWARD_LEVELS: { value: AwardLevel; label: string; shortLabel: string }[] = [
  { value: "squadron", label: "Squadron", shortLabel: "SQ" },
  { value: "group", label: "Group", shortLabel: "GP" },
  { value: "wing", label: "Wing", shortLabel: "WG" },
  { value: "majcom", label: "MAJCOM", shortLabel: "MAJCOM" },
  { value: "haf", label: "Headquarters Air Force", shortLabel: "HAF" },
];

export const AWARD_CATEGORIES: { value: AwardCategory; label: string }[] = [
  { value: "snco", label: "SNCO (Senior NCO)" },
  { value: "nco", label: "NCO" },
  { value: "amn", label: "Airman" },
  { value: "jr_tech", label: "Junior Technician" },
  { value: "sr_tech", label: "Senior Technician" },
  { value: "innovation", label: "Innovation" },
  { value: "volunteer", label: "Volunteer" },
  { value: "team", label: "Team" },
];

export const AWARD_QUARTERS: { value: AwardQuarter; label: string }[] = [
  { value: "Q1", label: "Q1 (Jan-Mar)" },
  { value: "Q2", label: "Q2 (Apr-Jun)" },
  { value: "Q3", label: "Q3 (Jul-Sep)" },
  { value: "Q4", label: "Q4 (Oct-Dec)" },
];

// Get quarter from a date
export function getQuarterFromDate(date: Date): AwardQuarter {
  const month = date.getMonth();
  if (month <= 2) return "Q1";
  if (month <= 5) return "Q2";
  if (month <= 8) return "Q3";
  return "Q4";
}

// Get quarter date range
export function getQuarterDateRange(quarter: AwardQuarter, year: number): { start: string; end: string } {
  const ranges: Record<AwardQuarter, { startMonth: number; endMonth: number }> = {
    Q1: { startMonth: 0, endMonth: 2 },
    Q2: { startMonth: 3, endMonth: 5 },
    Q3: { startMonth: 6, endMonth: 8 },
    Q4: { startMonth: 9, endMonth: 11 },
  };
  const range = ranges[quarter];
  const start = new Date(year, range.startMonth, 1);
  const end = new Date(year, range.endMonth + 1, 0); // Last day of end month
  return {
    start: start.toISOString().split("T")[0],
    end: end.toISOString().split("T")[0],
  };
}

