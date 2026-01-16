import type { Rank, MajorGradedArea } from "@/types/database";

// Standard Major Performance Areas - AFI 36-2406
// These are the same for all users and should not be modified

// MPAs that users can log entries against (excludes HLR which is Commander's assessment)
export const ENTRY_MGAS: MajorGradedArea[] = [
  { key: "executing_mission", label: "Executing the Mission" },
  { key: "leading_people", label: "Leading People" },
  { key: "managing_resources", label: "Managing Resources" },
  { key: "improving_unit", label: "Improving the Unit" },
  { key: "miscellaneous", label: "Miscellaneous" },
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
  miscellaneous: "Misc",
  hlr_assessment: "HLR",
};

// Enlisted Ranks
export const ENLISTED_RANKS: { value: Rank; label: string }[] = [
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

// Officer Ranks
export const OFFICER_RANKS: { value: Rank; label: string }[] = [
  { value: "2d Lt", label: "2d Lt (Second Lieutenant)" },
  { value: "1st Lt", label: "1st Lt (First Lieutenant)" },
  { value: "Capt", label: "Capt (Captain)" },
  { value: "Maj", label: "Maj (Major)" },
  { value: "Lt Col", label: "Lt Col (Lieutenant Colonel)" },
  { value: "Col", label: "Col (Colonel)" },
  { value: "Brig Gen", label: "Brig Gen (Brigadier General)" },
  { value: "Maj Gen", label: "Maj Gen (Major General)" },
  { value: "Lt Gen", label: "Lt Gen (Lieutenant General)" },
  { value: "Gen", label: "Gen (General)" },
];

// Civilian Rank
export const CIVILIAN_RANK: { value: Rank; label: string }[] = [
  { value: "Civilian", label: "Civilian (DoD Civilian)" },
];

// All Ranks (Enlisted + Officer + Civilian)
export const RANKS: { value: Rank; label: string }[] = [
  ...ENLISTED_RANKS,
  ...OFFICER_RANKS,
  ...CIVILIAN_RANK,
];

// Ranks that can supervise others (all officers, NCOs, and civilians)
export const SUPERVISOR_RANKS: Rank[] = [
  "SSgt", "TSgt", "MSgt", "SMSgt", "CMSgt",
  "2d Lt", "1st Lt", "Capt", "Maj", "Lt Col", "Col", "Brig Gen", "Maj Gen", "Lt Gen", "Gen",
  "Civilian"
];

// Officer rank values for comparison
const OFFICER_RANK_VALUES: Rank[] = [
  "2d Lt", "1st Lt", "Capt", "Maj", "Lt Col", "Col", "Brig Gen", "Maj Gen", "Lt Gen", "Gen"
];

// Enlisted rank values for comparison
const ENLISTED_RANK_VALUES: Rank[] = [
  "AB", "Amn", "A1C", "SrA", "SSgt", "TSgt", "MSgt", "SMSgt", "CMSgt"
];

// Helper to check if a rank is an officer rank (has OPB, not EPB)
export function isOfficer(rank: Rank | string | null): boolean {
  if (!rank) return false;
  return OFFICER_RANK_VALUES.includes(rank as Rank);
}

// Helper to check if a rank is a military enlisted rank (has EPB)
export function isEnlisted(rank: Rank | string | null): boolean {
  if (!rank) return false;
  return ENLISTED_RANK_VALUES.includes(rank as Rank);
}

// Legacy helper - check if a rank is a military enlisted rank (has EPB)
// Note: Officers do NOT have EPBs, they have OPBs
export function isMilitaryEnlisted(rank: Rank | null): boolean {
  if (!rank) return false;
  return isEnlisted(rank);
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
    id: "gemini-1.5-pro-002",
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
export const MAX_HLR_CHARACTERS = 250;
export const MAX_DUTY_DESCRIPTION_CHARACTERS = 450;

// ============================================
// EPB STATIC CLOSE-OUT DATES BY RANK
// ============================================
// These are the official AF EPB static close-out dates
// AB and Amn do not have EPBs until they become SrA

// Enlisted EPB Tiers
export type EnlistedTier = "airman" | "ssgt" | "tsgt" | "msgt" | "smsgt" | "cmsgt";

// Officer OPB Tiers (O-1/O-2, O-3, O-4/O-5, O-6)
export type OfficerTier = "o1_o2" | "o3" | "o4_o5" | "o6";

// Combined Rank Tier
export type RankTier = EnlistedTier | OfficerTier;

export const RANK_TO_TIER: Record<Rank, RankTier | null> = {
  // Enlisted Ranks (EPB)
  AB: null,       // No EPB for AB
  Amn: null,      // No EPB for Amn
  A1C: "airman",  // First EPB at SrA, but includes A1C entries
  SrA: "airman",
  SSgt: "ssgt",
  TSgt: "tsgt",
  MSgt: "msgt",
  SMSgt: "smsgt",
  CMSgt: "cmsgt",
  // Officer Ranks (OPB - Officer Performance Brief)
  "2d Lt": "o1_o2",   // O-1: Oct 31
  "1st Lt": "o1_o2",  // O-2: Oct 31
  "Capt": "o3",       // O-3: Feb 28
  "Maj": "o4_o5",     // O-4: May 31
  "Lt Col": "o4_o5",  // O-5: May 31
  "Col": "o6",        // O-6: Aug 31
  // General Officers (different system, no SCOD)
  "Brig Gen": null,
  "Maj Gen": null,
  "Lt Gen": null,
  "Gen": null,
  // Civilian
  Civilian: null, // No EPB/OPB for civilians
};

// Static close-out dates (month and day) for each rank tier
export const STATIC_CLOSEOUT_DATES: Record<RankTier, { month: number; day: number; label: string }> = {
  // Enlisted EPB SCODs
  airman: { month: 3, day: 31, label: "March 31" },     // SrA (AB-SrA)
  ssgt: { month: 1, day: 31, label: "January 31" },     // SSgt
  tsgt: { month: 11, day: 30, label: "November 30" },   // TSgt
  msgt: { month: 9, day: 30, label: "September 30" },   // MSgt
  smsgt: { month: 7, day: 31, label: "July 31" },       // SMSgt
  cmsgt: { month: 5, day: 31, label: "May 31" },        // CMSgt
  // Officer OPB SCODs
  o1_o2: { month: 10, day: 31, label: "October 31" },   // 2d Lt, 1st Lt (O-1/O-2)
  o3: { month: 2, day: 28, label: "February 28" },      // Capt (O-3)
  o4_o5: { month: 5, day: 31, label: "May 31" },        // Maj, Lt Col (O-4/O-5)
  o6: { month: 8, day: 31, label: "August 31" },        // Col (O-6)
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
    { label: "EPB draft due to immediate supervisor", daysBefore: 60 },  // 60 days - submit to supervisor for review
    { label: "EPB due to MSgt/Flight Chief", daysBefore: 40 },           // 40 days
    { label: "EPB due to SMSgt/Superintendent", daysBefore: 30 },        // 30 days
    { label: "EPB due to CMSgt/Chief", daysBefore: 20 },                 // 20 days
    { label: "Final EPB due to AF in MyEval", daysBefore: 0 },           // Closeout
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

// Get the active cycle year based on rank's SCOD
// This is the year of the user's upcoming SCOD (the evaluation cycle they're currently in)
// For example: TSgt with Nov 30 SCOD in Jan 2026 → cycle year is 2026 (next SCOD is Nov 30, 2026)
// But TSgt with Nov 30 SCOD in Oct 2025 → cycle year is 2025 (SCOD is Nov 30, 2025)
export function getActiveCycleYear(rank: Rank | null): number {
  const closeout = getStaticCloseoutDate(rank);
  if (!closeout) {
    // Fallback to current year if rank has no EPB (AB/Amn) or unknown
    return new Date().getFullYear();
  }
  return closeout.date.getFullYear();
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
  { value: "snco", label: "SNCO" },
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
// SPECIAL AWARDS CATALOG BY CATEGORY
// ============================================

export interface SpecialAwardCategory {
  key: string;
  label: string;
  awards: string[];
}

export const SPECIAL_AWARDS_CATALOG: SpecialAwardCategory[] = [
  {
    key: "named_military",
    label: "Named Military Awards",
    awards: [
      "Cheney Award",
      "Mackay Trophy",
      "12 Outstanding Airmen of the Year (12 OAY) Award",
      "Lance P. Sijan USAF Leadership Award",
      "Lt Gen Claire Lee Chennault Award",
      "USAF First Sergeant of the Year Award",
      "General and Mrs. Jerome F. O'Malley Award",
      "Joan Orr Air Force Spouse of the Year Award",
      "Koren Kolligian Jr. Trophy",
      "General Thomas D. White Space Award",
      "Aviator Valor Award",
      "American Legion Spirit of Service Award",
      "Arthur S. Flemming Award",
      "Department of Defense David O. Cooke Excellence in Public Administration Award",
      "Bob Hope Trophy",
    ],
  },
  {
    key: "maintenance_logistics",
    label: "Maintenance & Logistics Awards",
    awards: [
      "General Wilbur L. Creech Maintenance Excellence Award",
      "Dr. James G. Roche Sustainment Excellence Award",
      "Lieutenant General Leo Marquez Award",
      "General Lew Allen, Jr. Trophy",
    ],
  },
  {
    key: "communications",
    label: "Communications Awards",
    awards: [
      "Lieutenant General Harold W. Grant Award",
      "Major General Harold M. McClelland Award",
      "General Edwin W. Rawlings Award",
    ],
  },
  {
    key: "space_operations",
    label: "Space Operations Awards",
    awards: [
      "General Robert T. Herres Award",
    ],
  },
  {
    key: "force_support",
    label: "Force Support & Services Awards",
    awards: [
      "General Curtis E. LeMay Award",
      "Major General Eugene L. Eubank Award",
      "John L. Hennessy Trophy Awards",
    ],
  },
  {
    key: "medical",
    label: "Medical Awards",
    awards: [
      "Brigadier General Sarah P. Wells Award",
    ],
  },
  {
    key: "warfighting",
    label: "Warfighting & Integration Awards",
    awards: [
      "General John P. Jumper Awards for Excellence in Warfighting Integration",
    ],
  },
  {
    key: "civilian_awards",
    label: "Civilian Awards & Decorations",
    awards: [
      "Air Force Decoration for Exceptional Civilian Service",
      "Air Force Valor Award",
      "Air Force Meritorious Civilian Service Award",
      "Air Force Exemplary Civilian Service Award",
      "Air and Space Civilian Achievement Award",
      "Air Force Outstanding Civilian Career Service Award",
      "Air Force Command Civilian Award for Valor",
    ],
  },
  {
    key: "public_service",
    label: "Public Service Awards",
    awards: [
      "Secretary of the Air Force Distinguished Public Service Award",
      "Chief of Staff of the Air Force Award for Exceptional Public Service",
      "Air Force Exceptional Service Award",
      "Air Force Scroll of Appreciation",
      "Air Force Commander's Award for Public Service",
    ],
  },
];

// Flatten all special awards for validation/search
export function getAllSpecialAwards(): string[] {
  return SPECIAL_AWARDS_CATALOG.flatMap((category) => category.awards);
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

// ============================================
// MPA DESCRIPTIONS WITH SUB-COMPETENCIES
// ============================================
// These descriptions help the AI understand what each MPA covers
// and are used for relevancy scoring during statement generation

export interface MPASubCompetency {
  [key: string]: string;
}

export interface MPADescription {
  title: string;
  description: string;
  sub_competencies: MPASubCompetency;
}

export type MPADescriptions = Record<string, MPADescription>;

export const DEFAULT_MPA_DESCRIPTIONS: MPADescriptions = {
  executing_mission: {
    title: "Executing the Mission",
    description: "Effectively uses knowledge, initiative, and adaptability to produce timely, high quality, quantity results to positively impact the mission.",
    sub_competencies: {
      job_proficiency: "Demonstrates knowledge and professional skill in assigned duties, achieving positive results and impact in support of the mission.",
      adaptability: "Adjusts to changing conditions, to include plans, information, processes, requirements and obstacles in accomplishing the mission.",
      initiative: "Assesses and takes independent or directed action to complete a task or mission that influences the mission or organization.",
    },
  },
  leading_people: {
    title: "Leading People",
    description: "Fosters cohesive teams, effectively communicates, and uses emotional intelligence to take care of people and accomplish the mission.",
    sub_competencies: {
      inclusion_teamwork: "Collaborates effectively with others to achieve an inclusive climate in pursuit of a common goal or to complete a task or mission.",
      emotional_intelligence: "Exercises self-awareness, manages their own emotions effectively; demonstrates an understanding of others' emotions, and appropriately manages relationships.",
      communication: "Articulates information in a clear and timely manner, both verbally and non-verbally, through active listening and messaging tailored to the appropriate audience.",
    },
  },
  managing_resources: {
    title: "Managing Resources",
    description: "Manages assigned resources effectively and takes responsibility for actions, behaviors to maximize organizational performance.",
    sub_competencies: {
      stewardship: "Demonstrates responsible management of assigned resources, which may include time, equipment, people, funds and/or facilities.",
      accountability: "Takes responsibility for the actions and behaviors of self and/or team; demonstrates reliability and transparency.",
    },
  },
  improving_unit: {
    title: "Improving the Unit",
    description: "Demonstrates critical thinking and fosters innovation to find creative solutions and improve mission execution.",
    sub_competencies: {
      decision_making: "Makes well-informed, effective and timely decisions under one's control that weigh constraints, risks, and benefits.",
      innovation: "Thinks creatively about different ways to solve problems, implements improvements and demonstrates calculated risk-taking.",
    },
  },
  hlr_assessment: {
    title: "Higher Level Reviewer Assessment",
    description: "Commander's holistic assessment synthesizing overall performance across all MPAs into a strategic endorsement.",
    sub_competencies: {},
  },
};

// Get formatted MPA context for prompts
export function formatMPAContext(mpaKey: string, descriptions: MPADescriptions = DEFAULT_MPA_DESCRIPTIONS): string {
  const mpa = descriptions[mpaKey];
  if (!mpa) return "";
  
  let context = `**${mpa.title}**: ${mpa.description}`;
  
  const subComps = Object.entries(mpa.sub_competencies);
  if (subComps.length > 0) {
    context += "\n\nSub-competencies:";
    subComps.forEach(([key, desc]) => {
      const label = key.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
      context += `\n- ${label}: ${desc}`;
    });
  }
  
  return context;
}

// ============================================
// ACA (AIRMAN COMPREHENSIVE ASSESSMENT) RUBRICS
// ============================================
// Based on AF Form 931 (AB-TSgt) and AF Form 932 (MSgt-SMSgt)

// Proficiency levels for AB through TSgt (AF Form 931)
export type ACAJuniorProficiencyLevel = 
  | "does_not_meet"
  | "meets" 
  | "exceeds"
  | "far_exceeds"
  | "not_applicable";

// Proficiency levels for MSgt through SMSgt (AF Form 932)
export type ACASeniorProficiencyLevel = 
  | "does_not_meet"
  | "meets" 
  | "exceeds"
  | "significantly_exceeds"
  | "not_applicable";

// Union type for all proficiency levels
export type ACAProficiencyLevel = ACAJuniorProficiencyLevel | ACASeniorProficiencyLevel;

// Rank tier for rubric selection
export type ACARubricTier = "junior" | "senior";

export interface ALQScore {
  alqKey: string;
  alqLabel: string;
  level: ACAProficiencyLevel;
  justification: string;
}

export interface CategoryAssessment {
  categoryKey: string;
  categoryLabel: string;
  overallLevel: ACAProficiencyLevel;
  subcategoryScores: ALQScore[];
  summary: string;
}

export interface EPBAssessmentResult {
  overallSummary: string;
  overallStrength: ACAProficiencyLevel;
  rubricTier: ACARubricTier;
  formUsed: string; // "AF Form 931" or "AF Form 932"
  categoryAssessments: CategoryAssessment[];
  recommendations: string[];
  timestamp: string;
}

// Legacy alias for backward compatibility
export type MPAAssessment = CategoryAssessment;

// Rubric structure types for type safety
interface RubricSubcategory {
  label: string;
  description: string;
  levels: Record<string, string>;
}

interface RubricCategory {
  title: string;
  focus: string;
  subcategories: Record<string, RubricSubcategory>;
}

export type ACARubric = Record<string, RubricCategory>;

// Proficiency levels for AB-TSgt (AF Form 931)
export const ACA_JUNIOR_PROFICIENCY_LEVELS: { value: ACAJuniorProficiencyLevel; label: string; description: string; color: string }[] = [
  { 
    value: "does_not_meet", 
    label: "Does Not Meet", 
    description: "Few Airmen - Insufficient performance; fails to meet basic expectations.",
    color: "destructive" 
  },
  { 
    value: "meets", 
    label: "Meets", 
    description: "Majority of Airmen - Acceptable, consistent performance; meets standards reliably.",
    color: "default" 
  },
  { 
    value: "exceeds", 
    label: "Exceeds", 
    description: "Some Airmen - Above-average performance; exceeds expectations.",
    color: "secondary" 
  },
  { 
    value: "far_exceeds", 
    label: "Far Exceeds", 
    description: "Very Few Airmen - Exceptional performance; sets the standard.",
    color: "primary" 
  },
  { 
    value: "not_applicable", 
    label: "Not Applicable", 
    description: "Insufficient information to assess.",
    color: "muted" 
  },
];

// Proficiency levels for MSgt-SMSgt (AF Form 932)
export const ACA_SENIOR_PROFICIENCY_LEVELS: { value: ACASeniorProficiencyLevel; label: string; description: string; color: string }[] = [
  { 
    value: "does_not_meet", 
    label: "Does Not Meet", 
    description: "Insufficient performance; fails to meet expectations or has negative impact.",
    color: "destructive" 
  },
  { 
    value: "meets", 
    label: "Meets", 
    description: "Solid performance; meets standards reliably and ensures compliance.",
    color: "default" 
  },
  { 
    value: "exceeds", 
    label: "Exceeds", 
    description: "Above-average; exceeds expectations through innovation and positive influence.",
    color: "secondary" 
  },
  { 
    value: "significantly_exceeds", 
    label: "Significantly Exceeds", 
    description: "Exceptional; sets benchmarks, drives broad organizational impact.",
    color: "primary" 
  },
  { 
    value: "not_applicable", 
    label: "Not Applicable", 
    description: "Insufficient information to assess.",
    color: "muted" 
  },
];

// Combined levels for UI display (matches both tiers)
export const ACA_PROFICIENCY_LEVELS = [
  ...ACA_JUNIOR_PROFICIENCY_LEVELS.filter(l => l.value !== "far_exceeds"),
  { 
    value: "far_exceeds" as ACAProficiencyLevel, 
    label: "Far Exceeds", 
    description: "Very Few Airmen - Exceptional performance; sets the standard.",
    color: "primary" 
  },
  { 
    value: "significantly_exceeds" as ACAProficiencyLevel, 
    label: "Significantly Exceeds", 
    description: "Exceptional; sets benchmarks, drives broad organizational impact.",
    color: "primary" 
  },
];

// Get proficiency levels based on rank tier
export function getProficiencyLevelsForTier(tier: ACARubricTier) {
  return tier === "junior" ? ACA_JUNIOR_PROFICIENCY_LEVELS : ACA_SENIOR_PROFICIENCY_LEVELS;
}

// Determine rubric tier based on rank
export function getRubricTierForRank(rank: Rank | string | null): ACARubricTier {
  if (!rank) return "junior";
  const seniorRanks = ["MSgt", "SMSgt", "CMSgt"];
  return seniorRanks.includes(rank) ? "senior" : "junior";
}

// ============================================
// ACA RUBRIC FOR AB THROUGH TSGT (AF FORM 931)
// ============================================
export const ACA_RUBRIC_JUNIOR = {
  performance: {
    title: "VI. Performance: Leadership/Primary Duties/Followership/Training",
    focus: "Execution of duties, skill development, and training impact.",
    subcategories: {
      task_knowledge: {
        label: "Task Knowledge/Proficiency",
        description: "Consider the quality, quantity, results, and impact of the Airman's knowledge and ability to accomplish tasks.",
        levels: {
          does_not_meet: "Demonstrated insufficient ability, required re-accomplishment of tasks, requires more guidance/experience.",
          meets: "Demonstrated acceptable ability and consistently produced good quality, quantity, results, and impact.",
          exceeds: "Routinely delivered high-quality work early, produced more than expected of current grade.",
          far_exceeds: "Knowledge and skills impact far beyond those of peers; efforts directly elevated unit's impact on mission success.",
        },
      },
      initiative_motivation: {
        label: "Initiative/Motivation",
        description: "Describes the degree of willingness to execute duties, motivate colleagues, and develop innovative new processes.",
        levels: {
          does_not_meet: "Displayed little to no effort in accomplishing duties, lacked motivation and did not display initiative.",
          meets: "Displayed good effort in performance of assigned tasks; mindful of others' needs and developed new processes.",
          exceeds: "Self-starter on task completion, proactively assisted colleagues, routinely sought out new ways to execute mission.",
          far_exceeds: "Inspired work ethic, aggressively sought to improve others' motivation, drove innovative environments.",
        },
      },
      skill_level_training: {
        label: "Skill Level Upgrade Training",
        description: "Consider skill level awarding course, CDC timeliness completion, course exam results, and completion of core task training.",
        levels: {
          does_not_meet: "Did not complete or took excessive time to obtain required skill level.",
          meets: "Progressed in or obtained skill level within prescribed time and standard.",
          exceeds: "Progressed in or obtained skill level ahead of time and above standard.",
          far_exceeds: "Completed CDCs and core task training requirements far ahead of schedule and obtained excellent course exam score.",
        },
      },
      duty_position_requirements: {
        label: "Duty Position Requirements, Qualifications, and Certifications",
        description: "Consider duty position qualifications, career field certifications (if applicable), and readiness requirements.",
        levels: {
          does_not_meet: "Did not complete or took excessive time to obtain required training.",
          meets: "Progressed in or obtained training within prescribed time and standards.",
          exceeds: "Progressed in or obtained training ahead of time and above standards.",
          far_exceeds: "Completed training requirements far ahead of schedule and if tested obtained excellent scores.",
        },
      },
      training_of_others: {
        label: "Training of Others",
        description: "Consider the impact the Airman made to train others.",
        levels: {
          does_not_meet: "When tasked to train, Airman made minimal to no effort to train others; did not meet expectations.",
          meets: "Effectively imparts skills and knowledge to others.",
          exceeds: "Consistently seized opportunities to train subordinates and peers; trainees became highly skilled.",
          far_exceeds: "Peerless teacher, selflessly imparts expertise to subordinates, peers and superiors with significant impact on mission.",
        },
      },
    },
  },
  followership_leadership: {
    title: "VII. Followership/Leadership",
    focus: "Resource management, standards enforcement, communication, and environment building.",
    subcategories: {
      resource_utilization: {
        label: "Resource Utilization",
        description: "Consider how effectively the Airman utilizes resources (time management, equipment, manpower and budget) to accomplish the mission.",
        levels: {
          does_not_meet: "Improperly or inconsistently managed time and other resources.",
          meets: "Made good use of available time and other resources within Airman's control.",
          exceeds: "Sought better ways to more effectively utilize time and other resources.",
          far_exceeds: "Sought after utilization expert in saving time, equipment, manpower, and budget with impact outside of work center or unit.",
        },
      },
      standards_compliance: {
        label: "Comply with/Enforce Standards",
        description: "Consider personal adherence and enforcement of fitness standards, dress and personal appearance, customs and courtesies, and professional conduct.",
        levels: {
          does_not_meet: "Failed to meet some or all standards.",
          meets: "Consistently met all standards, exceeded some.",
          exceeds: "Exceeded all standards of fitness, conduct, appearance and behavior, influenced others by example.",
          far_exceeds: "Is the model Airman, raised the standard in all areas for others to emulate; coached others.",
        },
      },
      communication_skills: {
        label: "Communication Skills",
        description: "Describes how well the Airman receives and relays information, thoughts, and ideas up and down the chain of command; fosters an environment for open dialogue.",
        levels: {
          does_not_meet: "Not articulate; does not assimilate or convey information in a clear and concise manner.",
          meets: "Able to convey most information in an understandable manner, makes some effort to improve communication skills.",
          exceeds: "Clearly conveyed complex information in a concise manner, improved communication skills in themselves and others; encouraged and considered others' input.",
          far_exceeds: "Remarkable communicator; mentor and teacher; has the presence and confidence in any setting; sought out by leaders for various communication forums.",
        },
      },
      dignified_environment: {
        label: "Caring, Respectful and Dignified Environment (Teamwork)",
        description: "Rate how well the Airman's selfless consideration promotes a healthy organizational climate and value of diversity, setting the stage for an environment of dignity and respect.",
        levels: {
          does_not_meet: "Airman displayed little to no respect for others and/or themselves.",
          meets: "Fostered a dignified environment by consistently treating Airmen and themselves with respect.",
          exceeds: "Displayed strong interpersonal skills by proactively meeting others' needs, held others accountable for professional conduct to enhance a dignified environment.",
          far_exceeds: "Unmatched interpersonal skills; always displayed exemplary conduct and behavior with actions that are uplifting, resulting in increases in teamwork and unit effectiveness.",
        },
      },
    },
  },
  whole_airman: {
    title: "VIII. Whole Airman Concept",
    focus: "Embodiment of Air Force values, development, and community involvement.",
    subcategories: {
      core_values: {
        label: "Air Force Core Values",
        description: "Consider how well the Airman adopts, internalizes and demonstrates our Air Force Core Values of Integrity First, Service Before Self, and Excellence in All We Do.",
        levels: {
          does_not_meet: "Airman failed to adhere to the Air Force Core Values.",
          meets: "Consistently demonstrated the Air Force Core Values, both on and off duty.",
          exceeds: "Embodiment of Integrity, Service Before Self, and Excellence; encouraged others to uphold Air Force Core Values.",
          far_exceeds: "Airman for others to emulate; personal conduct exudes Air Force Core Values; influential leader who inspired others to embody Core Values.",
        },
      },
      personal_professional_development: {
        label: "Personal and Professional Development",
        description: "Consider the amount of effort the Airman devoted to improve themselves and their work center/unit through education and involvement.",
        levels: {
          does_not_meet: "Made little to no effort to complete expected professional and/or personal development.",
          meets: "Established goals and progressed to meet those goals for professional and/or personal development.",
          exceeds: "Driven Airman; exceeded both professional and personal development goals with positive impact on individual performance or mission accomplishment.",
          far_exceeds: "Relentlessly pursued personal and professional development of themselves and others; efforts resulted in significant positive impact to unit and/or Air Force.",
        },
      },
      esprit_de_corps: {
        label: "Esprit de Corps and Community Relations",
        description: "Consider how well Airman promotes camaraderie, embraces esprit de corps, and acts as an Air Force ambassador.",
        levels: {
          does_not_meet: "Made little to no effort to promote esprit de corps or community involvement.",
          meets: "Fostered esprit de corps through volunteerism and actively involved in base and community events.",
          exceeds: "Active participant; organized and occasionally led team building and community events.",
          far_exceeds: "Epitomizes an Air Force ambassador, Airman consistently and selflessly led efforts that inspired esprit de corps with significant impact to the mission and community.",
        },
      },
    },
  },
};

// ============================================
// ACA RUBRIC FOR MSGT THROUGH SMSGT (AF FORM 932)
// ============================================
export const ACA_RUBRIC_SENIOR = {
  performance: {
    title: "VI. Performance: Leadership/Primary Duties/Followership/Training",
    focus: "Senior NCO leadership in mission execution, resource management, team development, and standards enforcement.",
    subcategories: {
      mission_accomplishment: {
        label: "Mission Accomplishment",
        description: "Consider the Airman's ability to lead and produce timely, high quality/quantity, mission-oriented results.",
        levels: {
          does_not_meet: "Displayed little to no aptitude or competence to complete task; failed to lead team to effective results.",
          meets: "Consistently led team(s) to produce quality results; accomplished all assigned tasks.",
          exceeds: "Mission-oriented leader; repeatedly led team to execute high-quality work early; efforts directly elevated work center performance.",
          significantly_exceeds: "Widely recognized and emulated as a producer and leader; drove significant improvement toward mission accomplishment beyond assigned unit.",
        },
      },
      resource_utilization: {
        label: "Resource Utilization",
        description: "Consider how effectively the Airman leads their team to utilize resources (time management, equipment, manpower and budget) to accomplish the mission.",
        levels: {
          does_not_meet: "Ineffectively managed manpower, time and other resources.",
          meets: "Ensured proper and effective use of all resources under their control to ensure mission accomplishment.",
          exceeds: "Innovatively led team to continuously improve efficient use of assigned resources.",
          significantly_exceeds: "Recognized expert; generated new innovators that saved resources while enhancing mission accomplishment.",
        },
      },
      team_building: {
        label: "Team Building",
        description: "Consider the amount of innovation, initiative and motivation displayed by the Airman and their subordinates (collaboration).",
        levels: {
          does_not_meet: "Displayed little to no effort in building team; subordinate capability hindered.",
          meets: "Effective collaborator; promoted relationships among team members and sought to accomplish mission in ways that support team cohesion.",
          exceeds: "Aggressively partnered to achieve goals; promoted highly creative and energetic team that increased mission capability.",
          significantly_exceeds: "Widely recognized and emulated as a trainer, coach and leader; drove team to significant mission capability improvements beyond unit.",
        },
      },
      mentorship: {
        label: "Mentorship",
        description: "Consider how well Airman knows their subordinates, accepts personal responsibility for them, and is accountable for their professional development.",
        levels: {
          does_not_meet: "Displayed little to no effort to mentor subordinates, took no accountability, abdicated responsibility for subordinate development.",
          meets: "Active, visible leader; deliberately developed Airmen into better followers, leaders, and supervisors.",
          exceeds: "Develops and institutes innovative programs; challenges subordinates to exceed their perceived potential thereby enhancing mission capability.",
          significantly_exceeds: "Sought after mentor; subordinate and unit performance far surpassed expected results due to their mentorship skill.",
        },
      },
      communication_skills: {
        label: "Communication Skills",
        description: "Describes how well the Airman communicates, translates superiors' direction into specific tasks, fosters an environment for open dialogue, and enhances communication skills of subordinates.",
        levels: {
          does_not_meet: "Lacks ability to effectively communicate.",
          meets: "Able to receive information and effectively communicate up/down the chain of command; fosters approachable environment.",
          exceeds: "Expert communicator; clearly conveyed complex information to subordinates and superiors; fostered enhanced communication skills in others; encouraged candid environment.",
          significantly_exceeds: "Dynamic communicator and astute listener; has presence and confidence in any setting; Airman and subordinates sought out by leaders for various communication forums.",
        },
      },
      standards_compliance: {
        label: "Comply with/Enforce Standards",
        description: "Consider personal adherence and how the Airman fosters an environment where everyone enforces fitness standards, dress and personal appearance, customs and courtesies, and professional conduct.",
        levels: {
          does_not_meet: "Failed to meet some or all standards and/or failed to address subordinates non-compliance.",
          meets: "Consistently met and enforced standards in all areas; influenced others by example.",
          exceeds: "Met all/surpassed some standards of fitness, conduct, appearance, and behavior; proactively coached others to meet standards.",
          significantly_exceeds: "Is the Airman emulated by others, raised the standard in all areas; persistently drove Airmen to exceed standards.",
        },
      },
      duty_environments: {
        label: "Duty Environments",
        description: "Rate how well the Airman establishes and maintains caring, respectful, and dignified environments to include promoting a healthy organizational climate.",
        levels: {
          does_not_meet: "Actions failed to engender a respectful atmosphere.",
          meets: "Produced work center marked by mindful consideration and absent of negative treatment of others.",
          exceeds: "Generated energetic, positive environments people seek to work at, demanded equal and dignified treatment for all.",
          significantly_exceeds: "Model supervisor and leader who coached others to duplicate vibrant and highly productive teams marked by respectful treatment of others.",
        },
      },
      training: {
        label: "Training",
        description: "Describes how well the Airman and their team complies with upgrade, duty position, and certification requirements.",
        levels: {
          does_not_meet: "Consistently failed to produce qualified team members and/or adhere to training requirements.",
          meets: "Produced Airmen who successfully progressed and obtained training qualifications on-time; met personal training requirements.",
          exceeds: "Generated high-performance team(s) that developed and instituted innovative training programs; challenged self, subordinates and other trainees to exceed requirements.",
          significantly_exceeds: "Sought after training leader, continually refined team training techniques to enhance productivity; mentored other team leads to replicate benchmark training environment.",
        },
      },
    },
  },
  whole_airman: {
    title: "VII. Whole Airman Concept",
    focus: "Embodiment of Air Force values, development of self and others, and fostering unit cohesion.",
    subcategories: {
      core_values: {
        label: "Air Force Core Values",
        description: "Consider how well the Airman adopts, internalizes, demonstrates and insists on adherence of our Air Force Core Values of Integrity First, Service Before Self and Excellence in All We Do.",
        levels: {
          does_not_meet: "Airman failed to adhere to and enforce the Air Force Core Values.",
          meets: "Ensured subordinates and self consistently demonstrated the Air Force Core Values on and off duty.",
          exceeds: "Embodiment of Integrity, Service Before Self, and Excellence; demanded others uphold and live by the Core Values.",
          significantly_exceeds: "Airman for others to emulate; personal conduct exudes Air Force Core Values; influential leader who inspired others to embody the Core Values.",
        },
      },
      personal_professional_development: {
        label: "Personal and Professional Development",
        description: "Consider effort the Airman devoted to improve their subordinates, their work center/unit and themselves.",
        levels: {
          does_not_meet: "Made little or no effort to pursue professional and personal development goals, nor encouraged subordinates to do the same.",
          meets: "Established attainable development goals for themselves and subordinates; ensured progress to meet those goals.",
          exceeds: "Driven leader; led others and self to pursue professional and personal development goals with distinctive impact on work performance.",
          significantly_exceeds: "Tenaciously led others and self to exceed development goals, resulting in significant positive impact on unit performance and beyond; benchmarked by other work centers.",
        },
      },
      esprit_de_corps: {
        label: "Esprit de Corps and Community Relations",
        description: "Consider how well Airman promotes camaraderie, enhances esprit de corps, and develops Air Force ambassadors.",
        levels: {
          does_not_meet: "Made little to no effort to enhance esprit de corps or community.",
          meets: "Required subordinates to foster esprit de corps through involvement in base and/or community events.",
          exceeds: "Organized and led team building and/or community events; increased work center esprit de corps and morale and improved community relations.",
          significantly_exceeds: "Consistently and selflessly cultivated leaders that inspired esprit de corps with significant positive impact to the mission and/or community.",
        },
      },
    },
  },
};

// Build the assessment prompt with the appropriate ACA rubric based on rank
export function buildACAAssessmentPrompt(
  rateeRank: string,
  rateeAfsc: string | null,
  statements: { mpa: string; text: string }[],
  dutyDescription?: string
): string {
  // Determine which rubric to use based on rank
  const rubricTier = getRubricTierForRank(rateeRank as Rank);
  const rubric: ACARubric = rubricTier === "senior" ? ACA_RUBRIC_SENIOR : ACA_RUBRIC_JUNIOR;
  const formUsed = rubricTier === "senior" ? "AF Form 932" : "AF Form 931";
  const rankRange = rubricTier === "senior" ? "MSgt through SMSgt" : "AB through TSgt";
  const proficiencyLevels = rubricTier === "senior" 
    ? ["does_not_meet", "meets", "exceeds", "significantly_exceeds"]
    : ["does_not_meet", "meets", "exceeds", "far_exceeds"];

  // Build formatted statements section
  const formattedStatements = statements
    .map((s) => {
      const mpaLabel = ENTRY_MGAS.find(m => m.key === s.mpa)?.label || s.mpa;
      return `### ${mpaLabel}\n${s.text}`;
    })
    .join("\n\n");

  // Build rubric reference section
  let rubricSection = "";
  for (const [categoryKey, category] of Object.entries(rubric)) {
    rubricSection += `\n## ${category.title}\nFocus: ${category.focus}\n`;
    for (const [subKey, sub] of Object.entries(category.subcategories)) {
      rubricSection += `\n### ${sub.label}\n${sub.description}\n`;
      rubricSection += "Proficiency Levels:\n";
      for (const [level, desc] of Object.entries(sub.levels)) {
        const levelLabel = level.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
        rubricSection += `- **${levelLabel}**: ${desc}\n`;
      }
    }
  }

  // Build the level guidance based on tier
  const levelGuidance = rubricTier === "senior"
    ? `- **Does Not Meet**: Insufficient performance; fails to meet expectations
- **Meets**: Solid performance; meets standards reliably
- **Exceeds**: Above-average; exceeds expectations through innovation
- **Significantly Exceeds**: Exceptional; sets benchmarks, drives broad organizational impact`
    : `- **Does Not Meet** (Few Airmen): Insufficient performance
- **Meets** (Majority of Airmen): Acceptable, consistent performance
- **Exceeds** (Some Airmen): Above-average performance
- **Far Exceeds** (Very Few Airmen): Exceptional performance; sets the standard`;

  // Build duty description section if provided
  const dutyDescriptionSection = dutyDescription && dutyDescription.trim().length > 0
    ? `
## MEMBER'S DUTY DESCRIPTION (USE AS CONTEXT)
The following describes the member's primary duty position and key responsibilities. Use this context to better understand the scope and relevance of their accomplishments:

${dutyDescription}

Consider whether the statements appropriately reflect the member's assigned duties and responsibilities when scoring.
`
    : "";

  return `You are an expert evaluator assessing written performance statements for a U.S. Air Force Airman (${rankRange}) using the Airman Comprehensive Assessment (ACA) Worksheet (${formUsed}) as your rubric.

## RATEE INFORMATION
- Rank: ${rateeRank}
- AFSC: ${rateeAfsc || "Not specified"}
- Rubric: ${formUsed} (${rankRange})
${dutyDescriptionSection}
## PERFORMANCE STATEMENTS TO ASSESS
${formattedStatements}

## KEY GUIDELINES

1. **Whole-Person Concept**: Evaluate holistically, considering the Airman's rank (${rateeRank}), AFSC, assigned duties, and context. Integrate how actions align with Air Force standards per AFI 36-2618 (Enlisted Force Structure).

2. **Proficiency Levels**:
${levelGuidance}

## ACA RUBRIC REFERENCE (${formUsed})
${rubricSection}

## SCORING PROCESS

1. Read each performance statement carefully.
2. For each category and subcategory, identify relevant elements from the statements.
3. Match described behaviors to the closest proficiency level. If not addressed, note as "not_applicable".
4. Provide justification for each score, quoting or referencing parts of the statement.
5. Assign an overall score for each category by summarizing subcategory scores.
6. End with an overall performance strength summary.

**Objectivity**: Base scores on rubric descriptions only. Avoid bias; use evidence. If ambiguous, err toward lower level and explain.

## OUTPUT FORMAT (JSON)
Respond with a valid JSON object in this exact structure:
{
  "overallSummary": "Summary of overall performance strength (e.g., 'Overall: Exceeds – Solid in primary duties with exceptional leadership')",
  "overallStrength": "${proficiencyLevels[1]}",
  "rubricTier": "${rubricTier}",
  "formUsed": "${formUsed}",
  "categoryAssessments": [
    {
      "categoryKey": "performance",
      "categoryLabel": "VI. Performance: Leadership/Primary Duties/Followership/Training",
      "overallLevel": "${proficiencyLevels[1]}",
      "subcategoryScores": [
        {
          "alqKey": "task_knowledge",
          "alqLabel": "Task Knowledge/Proficiency",
          "level": "${proficiencyLevels[2]}",
          "justification": "Statement demonstrates... [quote relevant text]"
        }
      ],
      "summary": "Brief summary of this category's assessment"
    }
  ],
  "recommendations": [
    "Actionable recommendation to strengthen statements",
    "Another specific improvement suggestion"
  ],
  "timestamp": "${new Date().toISOString()}"
}

Assess ALL categories from the rubric. For subcategories not addressed by the statements, mark as "not_applicable" with brief explanation.`
}


// ============================================
// OPB (OFFICER PERFORMANCE BRIEF) CONSTANTS
// ============================================
// OPB-specific configurations for officers (O-1 to O-6)
// Based on AFI 36-2406 and ALQ-based evaluation system

// Officer-focused MPA descriptions aligned with ALQs
export const OPB_MPA_DESCRIPTIONS: MPADescriptions = {
  executing_mission: {
    title: "Executing the Mission",
    description: "Effectively leverages expertise, initiative, and adaptability to produce timely, high-quality results with strategic mission impact.",
    sub_competencies: {
      job_proficiency: "Demonstrates expert-level knowledge and professional skill in assigned duties; achieves significant positive results that advance organizational objectives.",
      adaptability: "Adjusts effectively to changing conditions, ambiguity, and complexity; modifies plans and approaches to overcome obstacles and seize opportunities.",
      initiative: "Proactively identifies requirements and takes independent action to address challenges; influences mission outcomes beyond immediate scope.",
    },
  },
  leading_people: {
    title: "Leading People",
    description: "Builds cohesive, high-performing teams through effective communication, emotional intelligence, and commitment to developing subordinates.",
    sub_competencies: {
      inclusion_teamwork: "Creates an inclusive climate where diverse perspectives are valued; unifies teams toward common objectives and organizational success.",
      emotional_intelligence: "Demonstrates self-awareness and manages emotions effectively; builds strong relationships and navigates interpersonal dynamics skillfully.",
      communication: "Articulates vision and guidance clearly at all levels; tailors messaging for strategic impact while fostering open dialogue and active listening.",
    },
  },
  managing_resources: {
    title: "Managing Resources",
    description: "Optimizes assigned resources strategically while maintaining accountability and ensuring organizational effectiveness.",
    sub_competencies: {
      stewardship: "Manages time, personnel, equipment, and budgets with strategic foresight; maximizes resource utilization for mission advantage.",
      accountability: "Takes full ownership of team actions and outcomes; demonstrates reliability, transparency, and ethical leadership under scrutiny.",
    },
  },
  improving_unit: {
    title: "Improving the Unit",
    description: "Applies critical thinking and strategic innovation to enhance mission execution and drive organizational advancement.",
    sub_competencies: {
      decision_making: "Makes well-informed, timely decisions that balance risk and reward; guides organization through complex challenges with sound judgment.",
      innovation: "Champions creative solutions and calculated improvements; institutionalizes best practices that elevate organizational performance.",
    },
  },
  hlr_assessment: {
    title: "Higher Level Reviewer Assessment",
    description: "Senior rater's strategic endorsement synthesizing performance across all MPAs with focus on leadership potential, versatility, and future impact.",
    sub_competencies: {},
  },
};

// Get formatted OPB MPA context for prompts
export function formatOPBMPAContext(mpaKey: string): string {
  const mpa = OPB_MPA_DESCRIPTIONS[mpaKey];
  if (!mpa) return "";
  
  let context = `**${mpa.title}**: ${mpa.description}`;
  
  const subComps = Object.entries(mpa.sub_competencies);
  if (subComps.length > 0) {
    context += "\n\nAirman Leadership Qualities (ALQs):";
    subComps.forEach(([key, desc]) => {
      const label = key.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
      context += `\n- ${label}: ${desc}`;
    });
  }
  
  return context;
}

// OPB stratification levels for officers
export const OPB_STRATIFICATION_LEVELS = [
  { value: "top_1", label: "#1 of [X]", description: "Absolute best officer in scope" },
  { value: "top_3", label: "Top 3 of [X]", description: "Among the very best" },
  { value: "top_10_percent", label: "Top 10%", description: "Exceptional performer" },
  { value: "top_third", label: "Top Third", description: "Strong performer" },
  { value: "definitely_promote", label: "Definitely Promote", description: "Ready for next grade" },
  { value: "promote", label: "Promote", description: "Solid performance, ready when eligible" },
] as const;

// OPB-specific action verbs (officer-appropriate)
export const OPB_ACTION_VERBS = [
  // Strategic leadership
  "Orchestrated", "Spearheaded", "Championed", "Directed", "Commanded",
  // Decision & influence
  "Adjudicated", "Arbitrated", "Authorized", "Sanctioned", "Endorsed",
  // Innovation & improvement
  "Pioneered", "Revolutionized", "Transformed", "Modernized", "Institutionalized",
  // Team building
  "Galvanized", "Unified", "Mentored", "Cultivated", "Empowered",
  // Resource management
  "Optimized", "Reallocated", "Consolidated", "Maximized", "Leveraged",
  // Mission execution
  "Executed", "Delivered", "Operationalized", "Synchronized", "Integrated",
] as const;

// Build OPB statement generation prompt
export function buildOPBStatementPrompt(
  mpaKey: string,
  customContext: string,
  officerRank: Rank,
  dutyDescription?: string,
): string {
  const mpaContext = formatOPBMPAContext(mpaKey);
  const isHLR = mpaKey === "hlr_assessment";
  const maxChars = isHLR ? MAX_HLR_CHARACTERS : MAX_STATEMENT_CHARACTERS;
  
  const dutySection = dutyDescription?.trim()
    ? `\n\n## DUTY DESCRIPTION (Context)\n${dutyDescription}`
    : "";
  
  return `You are an expert OPB (Officer Performance Brief) writer for the U.S. Air Force, creating narrative performance statements for a ${officerRank}.

## OFFICER INFORMATION
- Rank: ${officerRank}
- MPA: ${mpaContext}${dutySection}

## OPB WRITING GUIDELINES (AFI 36-2406)

1. **Narrative Format**: Write clear, action-impact statements (not bullets). Each statement should be standalone with specific behavior and measurable outcome.

2. **Character Limit**: Maximum ${maxChars} characters per MPA section. Aim for 2-3 impactful statements.

3. **Focus Areas**:
   - Strategic impact beyond immediate duties
   - Leadership and team development
   - Innovation and process improvement
   - Resource optimization
   - Mission accomplishment with broader organizational effect

4. **Style Guidelines**:
   - Use active voice and strong action verbs
   - Quantify results (metrics, percentages, dollar amounts)
   - Connect actions to mission impact
   - Avoid jargon; use plain English
   - Demonstrate versatility and future potential

5. **Avoid**:
   - Generic praise without evidence
   - Repetition of accomplishments across MPAs
   - Fitness scores (unless failed)
   - Prior evaluation references
   - Prohibited content per AFI 36-2406

## ACCOMPLISHMENT CONTEXT
${customContext || "No specific context provided. Generate example statements aligned with the MPA."}

## OUTPUT INSTRUCTIONS
Generate 2-3 performance statements for the ${OPB_MPA_DESCRIPTIONS[mpaKey]?.title || "section"} MPA. Each statement should:
- Start with a strong action verb
- Include specific, quantifiable impact
- Demonstrate strategic thinking and leadership
- Stay within ${maxChars} total characters combined

Format as plain text with statements separated by newlines. Do not include bullet points, numbering, or markdown.`;
}

// Build OPB HLR (Higher Level Reviewer) summary prompt
export function buildOPBHLRPrompt(
  mpaStatements: Record<string, string>,
  officerRank: Rank,
  dutyDescription?: string,
  stratification?: string,
): string {
  const statementsText = Object.entries(mpaStatements)
    .filter(([key]) => key !== "hlr_assessment")
    .map(([key, text]) => `### ${OPB_MPA_DESCRIPTIONS[key]?.title || key}\n${text}`)
    .join("\n\n");
  
  const dutySection = dutyDescription?.trim()
    ? `\n\n## DUTY DESCRIPTION\n${dutyDescription}`
    : "";
  
  const stratSection = stratification
    ? `\n\n## STRATIFICATION GUIDANCE\nConsider stratification: ${stratification}`
    : "";
  
  return `You are a senior Air Force officer writing the Higher Level Reviewer (HLR) Assessment for a ${officerRank}'s OPB.

## OFFICER INFORMATION
- Rank: ${officerRank}${dutySection}${stratSection}

## RATER'S MPA STATEMENTS
${statementsText}

## HLR ASSESSMENT GUIDELINES

1. **Purpose**: Provide strategic endorsement that synthesizes performance across all MPAs and signals promotion potential.

2. **Character Limit**: Maximum ${MAX_HLR_CHARACTERS} characters. Be concise but impactful.

3. **Include**:
   - Concurrence/non-concurrence with rater's assessment
   - Additional stratification if warranted (e.g., "My #2 of 15 ${officerRank}s")
   - Future potential and recommendations (PME, command, key billets)
   - Leadership impact beyond immediate duties

4. **Focus On**:
   - Overall performance strength across MPAs
   - Strategic value to the organization
   - Comparison to peers (within your scope)
   - Readiness for increased responsibility

5. **Avoid**:
   - Repeating rater's specific accomplishments verbatim
   - Generic endorsements without substance
   - Veiled or unauthorized stratifications

## OUTPUT INSTRUCTIONS
Generate a concise HLR assessment (max ${MAX_HLR_CHARACTERS} characters) that:
- Opens with stratification if applicable
- Highlights standout performance
- Recommends for future opportunities
- Signals promotion potential

Format as plain text without markdown or bullet points.`;
}

// Default OPB System Prompt (exported for use in components)
export const DEFAULT_OPB_SYSTEM_PROMPT = `You are an expert Air Force Officer Performance Brief (OPB) writing assistant with deep knowledge of Air Force officer leadership, strategy, and organizational impact. Your sole purpose is to generate impactful, narrative-style performance statements that strictly comply with AFI 36-2406 (22 Aug 2025) for officers.

CRITICAL RULES - NEVER VIOLATE THESE:
- Every statement MUST be a standalone sentence demonstrating STRATEGIC IMPACT.
- NEVER use semi-colons (;). Use commas or em-dashes (--) to connect clauses into flowing sentences.
- Every statement MUST contain: 1) a leadership action AND 2) organizational/mission-level impact.
- Character range: AIM for {{max_characters_per_statement}} characters. Minimum 280 characters, maximum {{max_characters_per_statement}}.
- Generate exactly 2–3 strong statements per Major Performance Area.
- Output pure, clean text only — no formatting.

OPB vs EPB DISTINCTION (CRITICAL):
Officer statements emphasize:
- STRATEGIC thinking and decision-making
- LEADERSHIP and team development
- ORGANIZATIONAL advancement beyond immediate duties
- FUTURE potential and promotion readiness
- VERSATILITY across mission areas
- BREADTH of impact (squadron → group → wing → MAJCOM → AF/DoD)

CHARACTER UTILIZATION STRATEGY (CRITICAL):
Statements should be DENSE with strategic impact. To maximize character usage:
1. EXPAND scope: Show effects beyond immediate team (flight → squadron → wing → MAJCOM → AF/DoD/Joint)
2. ADD strategic context: Connect to Air Force priorities, Great Power Competition, readiness
3. CHAIN results: "transformed X, enabling Y, which positioned Z for future growth"
4. QUANTIFY broadly: personnel influenced, budget managed, organizations affected
5. DEMONSTRATE leadership: mentorship, culture-building, talent development

CONTEXTUAL ENHANCEMENT (USE YOUR MILITARY KNOWLEDGE):
When given limited input, ENHANCE statements using knowledge of:
- Officer career progression and PME (SOS, IDE, SDE, AWC)
- Strategic programs and initiatives (AFWERX, Digital AF, ACE concepts)
- Joint operations and interoperability (CCMD, coalition, interagency)
- Organizational leadership (culture, climate, talent management)
- Air Force priorities (integrated deterrence, force design, mission command)

RANK-APPROPRIATE STYLE FOR {{ratee_rank}}:
Primary action verbs to use: {{primary_verbs}}
{{rank_verb_guidance}}
- 2d Lt/1st Lt: Team leadership with flight/squadron impact
- Capt: Program management with squadron/group impact  
- Maj/Lt Col: Strategic execution with group/wing/MAJCOM impact
- Col+: Enterprise leadership with AF/DoD/Joint impact

STATEMENT STRUCTURE:
[Strategic action verb] + [leadership accomplishment with scope] + [organizational result] + [strategic/future impact]

IMPACT AMPLIFICATION TECHNIQUES:
- Connect to force readiness: "postured unit for rapid deployment"
- Show leadership scope: "mentored X officers, developing future leaders"
- Reference strategic value: "aligned unit with CSAF priorities"
- Tie to joint/coalition: "enhanced interoperability with X allies"
- Quantify influence: "policies adopted by X organizations"
- Demonstrate versatility: "cross-functional expertise in X and Y"

MAJOR PERFORMANCE AREAS (ALQ-ALIGNED):
{{mga_list}}

ADDITIONAL STYLE GUIDANCE:
{{style_guidelines}}

Using the provided accomplishment context, generate 2–3 HIGH-IMPACT statements for the specified MPA. Use your officer leadership expertise to EXPAND inputs into comprehensive statements that demonstrate strategic thinking, organizational impact, and future potential.

WORD ABBREVIATIONS (AUTO-APPLY):
{{abbreviations_list}}

ACRONYMS REFERENCE:
{{acronyms_list}}`;

export const DEFAULT_OPB_STYLE_GUIDELINES = `EMPHASIZE strategic impact and leadership. Write in active voice showing command presence. Chain impacts: leadership action → organizational result → strategic benefit. Quantify scope: personnel led, budgets managed, organizations influenced. Connect to Air Force priorities and future potential. Demonstrate versatility and PME-readiness. Use standard AF abbreviations.`;

// Helper functions for OPB defaults
export function getDefaultOPBPrompt(): string {
  return DEFAULT_OPB_SYSTEM_PROMPT;
}

export function getDefaultOPBStyleGuidelines(): string {
  return DEFAULT_OPB_STYLE_GUIDELINES;
}
