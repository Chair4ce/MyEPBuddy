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
  { value: "Civilian", label: "Civilian (DoD Civilian)" },
];

// Ranks that can supervise others
export const SUPERVISOR_RANKS: Rank[] = ["SSgt", "TSgt", "MSgt", "SMSgt", "CMSgt", "Civilian"];

// Helper to check if a rank is a military enlisted rank (has EPB)
export function isMilitaryEnlisted(rank: Rank | null): boolean {
  if (!rank) return false;
  return rank !== "Civilian";
}

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
// EPB STATIC CLOSE-OUT DATES BY RANK
// ============================================
// These are the official AF EPB static close-out dates
// AB and Amn do not have EPBs until they become SrA

export type RankTier = "airman" | "ssgt" | "tsgt" | "msgt" | "smsgt" | "cmsgt";

export const RANK_TO_TIER: Record<Rank, RankTier | null> = {
  AB: null,       // No EPB for AB
  Amn: null,      // No EPB for Amn
  A1C: "airman",  // First EPB at SrA, but includes A1C entries
  SrA: "airman",
  SSgt: "ssgt",
  TSgt: "tsgt",
  MSgt: "msgt",
  SMSgt: "smsgt",
  CMSgt: "cmsgt",
  Civilian: null, // No EPB for civilians
};

// Static close-out dates (month and day) for each rank tier
export const STATIC_CLOSEOUT_DATES: Record<RankTier, { month: number; day: number; label: string }> = {
  airman: { month: 3, day: 31, label: "March 31" },     // AB-SrA
  ssgt: { month: 9, day: 30, label: "September 30" },   // SSgt
  tsgt: { month: 11, day: 30, label: "November 30" },   // TSgt
  msgt: { month: 1, day: 31, label: "January 31" },     // MSgt
  smsgt: { month: 5, day: 31, label: "May 31" },        // SMSgt
  cmsgt: { month: 7, day: 31, label: "July 31" },       // CMSgt
};

// Get the static close-out date for a given rank
export function getStaticCloseoutDate(rank: Rank | null): { date: Date; label: string } | null {
  if (!rank) return null;
  
  const tier = RANK_TO_TIER[rank];
  if (!tier) return null; // AB and Amn don't have EPBs
  
  const closeout = STATIC_CLOSEOUT_DATES[tier];
  const now = new Date();
  let year = now.getFullYear();
  
  // If we've passed this year's closeout, use next year
  const thisYearDate = new Date(year, closeout.month - 1, closeout.day);
  if (now > thisYearDate) {
    year += 1;
  }
  
  return {
    date: new Date(year, closeout.month - 1, closeout.day),
    label: closeout.label,
  };
}

// Get days until close-out
export function getDaysUntilCloseout(rank: Rank | null): number | null {
  const closeout = getStaticCloseoutDate(rank);
  if (!closeout) return null;
  
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diff = closeout.date.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

// Get EPB submission milestones (60 days, 40 days, 30 days before close-out)
export function getEPBMilestones(rank: Rank | null): { label: string; date: Date; daysFromNow: number; isPast: boolean }[] | null {
  const closeout = getStaticCloseoutDate(rank);
  if (!closeout) return null;
  
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  
  const milestones = [
    { label: "EPB due to immediate supervisor", daysBefore: 67 },    // ~1 week before 60
    { label: "EPB due to next tier", daysBefore: 60 },               // 60 days
    { label: "EPB due to MSgt/Flight Chief", daysBefore: 40 },       // 40 days
    { label: "EPB due to SMSgt/Superintendent", daysBefore: 30 },    // 30 days
    { label: "EPB due to CMSgt/Chief", daysBefore: 20 },             // 20 days
    { label: "Final EPB due to AF in MyEval", daysBefore: 0 },       // Closeout
  ];
  
  return milestones.map(m => {
    const date = new Date(closeout.date);
    date.setDate(date.getDate() - m.daysBefore);
    const daysFromNow = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return {
      label: m.label,
      date,
      daysFromNow,
      isPast: daysFromNow < 0,
    };
  });
}

// Get cycle progress percentage (based on 12 month cycle ending at closeout)
export function getCycleProgress(rank: Rank | null): number | null {
  const closeout = getStaticCloseoutDate(rank);
  if (!closeout) return null;
  
  // Cycle starts 12 months before close-out
  const cycleStart = new Date(closeout.date);
  cycleStart.setFullYear(cycleStart.getFullYear() - 1);
  
  const now = new Date();
  const totalDays = (closeout.date.getTime() - cycleStart.getTime()) / (1000 * 60 * 60 * 24);
  const elapsedDays = (now.getTime() - cycleStart.getTime()) / (1000 * 60 * 60 * 24);
  
  return Math.min(100, Math.max(0, (elapsedDays / totalDays) * 100));
}

// Get urgency level based on days until closeout
export function getCloseoutUrgency(daysUntil: number | null): "none" | "low" | "medium" | "high" | "critical" {
  if (daysUntil === null) return "none";
  if (daysUntil <= 30) return "critical";
  if (daysUntil <= 60) return "high";
  if (daysUntil <= 90) return "medium";
  if (daysUntil <= 180) return "low";
  return "none";
}

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

// Fiscal year quarter date range (Oct-Sep)
export function getFiscalQuarterDateRange(quarter: AwardQuarter, fiscalYear: number): { start: string; end: string } {
  // Fiscal year starts Oct 1 of prior calendar year
  // FY25 = Oct 2024 - Sep 2025
  const ranges: Record<AwardQuarter, { startMonth: number; yearOffset: number; endMonth: number; endYearOffset: number }> = {
    Q1: { startMonth: 9, yearOffset: -1, endMonth: 11, endYearOffset: -1 }, // Oct-Dec
    Q2: { startMonth: 0, yearOffset: 0, endMonth: 2, endYearOffset: 0 },    // Jan-Mar
    Q3: { startMonth: 3, yearOffset: 0, endMonth: 5, endYearOffset: 0 },    // Apr-Jun
    Q4: { startMonth: 6, yearOffset: 0, endMonth: 8, endYearOffset: 0 },    // Jul-Sep
  };
  const range = ranges[quarter];
  const startYear = fiscalYear + range.yearOffset;
  const endYear = fiscalYear + range.endYearOffset;
  const start = new Date(startYear, range.startMonth, 1);
  const end = new Date(endYear, range.endMonth + 1, 0); // Last day of end month
  return {
    start: start.toISOString().split("T")[0],
    end: end.toISOString().split("T")[0],
  };
}

// ============================================
// AF FORM 1206 AWARD CATEGORIES
// ============================================

export interface Award1206Category {
  key: string;
  label: string;
  heading: string; // Exact heading for 1206
  description?: string; // Optional description for UI hints
}

// AF Form 1206 Award Categories (standard quarterly/annual award format)
export const AWARD_1206_CATEGORIES: Award1206Category[] = [
  { 
    key: "leadership_job_performance", 
    label: "Leadership & Job Performance", 
    heading: "LEADERSHIP AND JOB PERFORMANCE IN PRIMARY DUTY",
    description: "Excellence, initiative, and mission accomplishment in core role. Highlight significant achievements beyond routine duties."
  },
  { 
    key: "significant_self_improvement", 
    label: "Self-Improvement", 
    heading: "SIGNIFICANT SELF-IMPROVEMENT",
    description: "Education (courses, degrees), professional development, skill acquisition, certifications, and leadership training."
  },
  { 
    key: "base_community_involvement", 
    label: "Base/Community", 
    heading: "BASE OR COMMUNITY INVOLVEMENT",
    description: "Volunteer work, base support activities, community service, cultural/religious activities, and public service."
  },
];

// Default sentences per category for awards
export const DEFAULT_AWARD_SENTENCES: Record<string, number> = {
  leadership_job_performance: 6,
  significant_self_improvement: 3,
  base_community_involvement: 3,
};

