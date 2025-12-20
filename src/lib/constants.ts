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

