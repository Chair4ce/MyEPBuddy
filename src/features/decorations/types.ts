/**
 * TypeScript types for Decoration Citation feature
 */

export type DecorationAwardType =
  | "afam"  // Air Force Achievement Medal
  | "afcm"  // Air Force Commendation Medal
  | "msm"   // Meritorious Service Medal
  | "lom"   // Legion of Merit
  | "bsm";  // Bronze Star Medal

export type DecorationReason =
  | "meritorious_service"     // PCS / extended period
  | "outstanding_achievement" // Specific project/operation
  | "act_of_courage"          // Non-combat heroism
  | "retirement"              // End of career
  | "separation"              // End of service
  | "posthumous"              // Awarded after death
  | "combat_meritorious"      // BSM combat service
  | "combat_valor";           // BSM with V device

export type ClosingIntensity =
  | "distinctive"              // AFAM, AFCM
  | "singularly_distinctive"   // MSM, LOM
  | "exceptionally_meritorious"; // BSM

export interface DecorationConfig {
  key: DecorationAwardType;
  name: string;
  abbreviation: string;
  afForm: string;
  /** Character limit per MyDecs Reimagined (Oct 2022+) */
  maxCharacters: number;
  /** @deprecated Use maxCharacters instead - legacy reference */
  maxLines12pt?: number;
  /** @deprecated Use maxCharacters instead - legacy reference */
  maxLines10pt?: number;
  typicalRanks: string;
  closingIntensity: ClosingIntensity;
}

export interface DecorationPromptParams {
  awardType: DecorationAwardType;
  reason: DecorationReason;
  rank: string;
  fullName: string;
  dutyTitle: string;
  /** Comma-separated assignment chain (e.g., "42 CS/SCOO, 67th Fighter Sq, Kadena AB, Japan") */
  assignmentLine: string;
  startDate: string;
  endDate: string;
  accomplishments: string[];
  gender?: "male" | "female";
  maxCharacters?: number;
  /** User-defined approved abbreviations for this citation (e.g., '"Command and Control" → "C2"') */
  approvedAbbreviations?: string;
}

export interface GenerateDecorationRequest {
  rateeId: string;
  rateeRank: string;
  rateeName: string;
  rateeGender?: "male" | "female";
  dutyTitle: string;
  unit: string;
  startDate: string;
  endDate: string;
  awardType: DecorationAwardType;
  reason: DecorationReason;
  accomplishments: string[];
  model: string;
}

export interface GenerateDecorationResponse {
  citation: string;
  metadata: {
    awardType: DecorationAwardType;
    awardName: string;
    characterCount: number;
    maxCharacters: number;
    withinLimit: boolean;
    estimatedLines: number;
    model: string;
  };
}

export interface DecorationReasonOption {
  key: DecorationReason;
  label: string;
  description: string;
}

export interface RankVerbs {
  primary: string[];
  secondary: string[];
}
