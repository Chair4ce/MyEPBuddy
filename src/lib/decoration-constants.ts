/**
 * Air Force Decoration Constants
 * Based on DAFMAN 36-2806 and AFI 36-2803
 */

export type DecorationAwardType = 
  | "afam"      // Air Force Achievement Medal
  | "afcm"      // Air Force Commendation Medal
  | "msm"       // Meritorious Service Medal
  | "lom"       // Legion of Merit
  | "bsm";      // Bronze Star Medal

export type DecorationReason =
  | "meritorious_service"    // PCS / extended period of service
  | "outstanding_achievement" // Specific project or operation
  | "act_of_courage"         // Heroism (non-combat)
  | "retirement"             // End of career
  | "separation"             // End of service (non-retirement)
  | "posthumous"             // Awarded after death
  | "combat_meritorious"     // BSM - combat meritorious service
  | "combat_valor";          // BSM with V device

export interface DecorationConfig {
  key: DecorationAwardType;
  name: string;
  abbreviation: string;
  afForm: string;
  maxLines12pt: number;
  maxLines10pt: number;
  typicalRanks: string;
  closingIntensity: "distinctive" | "singularly_distinctive" | "exceptionally_meritorious";
}

export const DECORATION_TYPES: DecorationConfig[] = [
  {
    key: "afam",
    name: "Air Force Achievement Medal",
    abbreviation: "AFAM",
    afForm: "AF Form 2274",
    maxLines12pt: 6,
    maxLines10pt: 9,
    typicalRanks: "E-1 through E-6",
    closingIntensity: "distinctive",
  },
  {
    key: "afcm",
    name: "Air Force Commendation Medal",
    abbreviation: "AFCM",
    afForm: "AF Form 2224",
    maxLines12pt: 8,
    maxLines10pt: 14,
    typicalRanks: "E-5 through E-7, O-1 through O-3",
    closingIntensity: "distinctive",
  },
  {
    key: "msm",
    name: "Meritorious Service Medal",
    abbreviation: "MSM",
    afForm: "AF Form 2228",
    maxLines12pt: 15,
    maxLines10pt: 15,
    typicalRanks: "E-7 and above, O-4 and above",
    closingIntensity: "singularly_distinctive",
  },
  {
    key: "lom",
    name: "Legion of Merit",
    abbreviation: "LOM",
    afForm: "AF Form 2239",
    maxLines12pt: 15,
    maxLines10pt: 15,
    typicalRanks: "E-9, O-5 and above",
    closingIntensity: "singularly_distinctive",
  },
  {
    key: "bsm",
    name: "Bronze Star Medal",
    abbreviation: "BSM",
    afForm: "DD Form 1348",
    maxLines12pt: 15,
    maxLines10pt: 15,
    typicalRanks: "Combat operations",
    closingIntensity: "exceptionally_meritorious",
  },
];

export const DECORATION_REASONS: { key: DecorationReason; label: string; description: string }[] = [
  {
    key: "meritorious_service",
    label: "Meritorious Service",
    description: "Extended period of exemplary service (typically PCS)",
  },
  {
    key: "outstanding_achievement",
    label: "Outstanding Achievement",
    description: "Specific project, operation, or significant accomplishment",
  },
  {
    key: "act_of_courage",
    label: "Act of Courage",
    description: "Heroism with voluntary risk of personal safety (non-combat)",
  },
  {
    key: "retirement",
    label: "Retirement",
    description: "End of military career",
  },
  {
    key: "separation",
    label: "Separation",
    description: "End of service (non-retirement)",
  },
  {
    key: "posthumous",
    label: "Posthumous",
    description: "Awarded after death",
  },
  {
    key: "combat_meritorious",
    label: "Combat Meritorious Service",
    description: "Meritorious service in combat operations (BSM)",
  },
  {
    key: "combat_valor",
    label: "Combat Valor",
    description: "Heroic action in combat (BSM with V device)",
  },
];

// Opening sentence templates by award type and reason
export const OPENING_TEMPLATES: Record<DecorationAwardType, Record<string, string>> = {
  afam: {
    meritorious_service: "{rank} {fullName} distinguished {himself/herself} by meritorious service as {dutyTitle}, {unit}.",
    outstanding_achievement: "{rank} {fullName} distinguished {himself/herself} by outstanding achievement as {dutyTitle}, {unit}, from {startDate} to {endDate}.",
    default: "{rank} {fullName} distinguished {himself/herself} by outstanding achievement while assigned to {unit}.",
  },
  afcm: {
    meritorious_service: "{rank} {fullName} distinguished {himself/herself} by meritorious service as {dutyTitle}, {unit}, from {startDate} to {endDate}.",
    outstanding_achievement: "{rank} {fullName} distinguished {himself/herself} by outstanding achievement as {dutyTitle}, {unit}, from {startDate} to {endDate}.",
    act_of_courage: "{rank} {fullName} distinguished {himself/herself} by an act of courage as {dutyTitle}, {unit}.",
    default: "{rank} {fullName} distinguished {himself/herself} by meritorious service while assigned to {unit}.",
  },
  msm: {
    meritorious_service: "{rank} {fullName} distinguished {himself/herself} in the performance of outstanding service to the United States as {dutyTitle}, {unit}, from {startDate} to {endDate}.",
    outstanding_achievement: "{rank} {fullName} distinguished {himself/herself} by outstanding achievement as {dutyTitle}, {unit}, from {startDate} to {endDate}.",
    default: "{rank} {fullName} distinguished {himself/herself} in the performance of outstanding service to the United States as {dutyTitle}, {unit}.",
  },
  lom: {
    meritorious_service: "{rank} {fullName} distinguished {himself/herself} by exceptionally meritorious conduct in the performance of outstanding service to the United States as {dutyTitle}, {unit}, from {startDate} to {endDate}.",
    default: "{rank} {fullName} distinguished {himself/herself} by exceptionally meritorious conduct in the performance of outstanding service as {dutyTitle}, {unit}.",
  },
  bsm: {
    combat_meritorious: "{rank} {fullName} distinguished {himself/herself} by meritorious service in connection with military operations against an armed enemy while serving as {dutyTitle}, {unit}, from {startDate} to {endDate}.",
    combat_valor: "{rank} {fullName} distinguished {himself/herself} by heroic achievement in connection with combat operations against an armed enemy while serving as {dutyTitle}, {unit}.",
    default: "{rank} {fullName} distinguished {himself/herself} by meritorious achievement in connection with military operations.",
  },
};

// Closing sentence templates by reason
export const CLOSING_TEMPLATES: Record<DecorationReason | "default", { distinctive: string; singularly_distinctive: string; exceptionally_meritorious: string }> = {
  default: {
    distinctive: "The distinctive accomplishments of {shortRank} {lastName} reflect credit upon {himself/herself} and the United States Air Force.",
    singularly_distinctive: "The singularly distinctive accomplishments of {shortRank} {lastName} reflect great credit upon {himself/herself} and the United States Air Force.",
    exceptionally_meritorious: "The exceptionally meritorious accomplishments of {shortRank} {lastName} reflect great credit upon {himself/herself} and the United States Air Force.",
  },
  meritorious_service: {
    distinctive: "The distinctive accomplishments of {shortRank} {lastName} reflect credit upon {himself/herself} and the United States Air Force.",
    singularly_distinctive: "The singularly distinctive accomplishments of {shortRank} {lastName} reflect great credit upon {himself/herself} and the United States Air Force.",
    exceptionally_meritorious: "The exceptionally meritorious accomplishments of {shortRank} {lastName} reflect great credit upon {himself/herself} and the United States Air Force.",
  },
  outstanding_achievement: {
    distinctive: "The distinctive accomplishments of {shortRank} {lastName} reflect credit upon {himself/herself} and the United States Air Force.",
    singularly_distinctive: "The singularly distinctive accomplishments of {shortRank} {lastName} reflect great credit upon {himself/herself} and the United States Air Force.",
    exceptionally_meritorious: "The exceptionally meritorious accomplishments of {shortRank} {lastName} reflect great credit upon {himself/herself} and the United States Air Force.",
  },
  retirement: {
    distinctive: "The distinctive accomplishments of {shortRank} {lastName} culminate a distinguished career in the service of {his/her} country and reflect credit upon {himself/herself} and the United States Air Force.",
    singularly_distinctive: "The singularly distinctive accomplishments of {shortRank} {lastName} culminate a long and distinguished career in the service of {his/her} country and reflect great credit upon {himself/herself} and the United States Air Force.",
    exceptionally_meritorious: "The exceptionally meritorious accomplishments of {shortRank} {lastName} culminate a long and distinguished career in the service of {his/her} country and reflect great credit upon {himself/herself} and the United States Air Force.",
  },
  separation: {
    distinctive: "The distinctive accomplishments of {shortRank} {lastName} while serving {his/her} country reflect credit upon {himself/herself} and the United States Air Force.",
    singularly_distinctive: "The singularly distinctive accomplishments of {shortRank} {lastName} while serving {his/her} country reflect great credit upon {himself/herself} and the United States Air Force.",
    exceptionally_meritorious: "The exceptionally meritorious accomplishments of {shortRank} {lastName} while serving {his/her} country reflect great credit upon {himself/herself} and the United States Air Force.",
  },
  posthumous: {
    distinctive: "The distinctive accomplishments of {shortRank} {lastName} in the dedication of {his/her} service to {his/her} country reflect credit upon {himself/herself} and the United States Air Force.",
    singularly_distinctive: "The singularly distinctive accomplishments of {shortRank} {lastName} in the dedication of {his/her} service to {his/her} country reflect great credit upon {himself/herself} and the United States Air Force.",
    exceptionally_meritorious: "The exceptionally meritorious accomplishments of {shortRank} {lastName} in the dedication of {his/her} service to {his/her} country reflect great credit upon {himself/herself} and the United States Air Force.",
  },
  act_of_courage: {
    distinctive: "By {his/her} prompt action and humanitarian regard for {his/her} fellowman, {shortRank} {lastName} has reflected credit upon {himself/herself} and the United States Air Force.",
    singularly_distinctive: "By {his/her} prompt action and humanitarian regard for {his/her} fellowman, {shortRank} {lastName} has reflected great credit upon {himself/herself} and the United States Air Force.",
    exceptionally_meritorious: "By {his/her} prompt action and humanitarian regard for {his/her} fellowman, {shortRank} {lastName} has reflected great credit upon {himself/herself} and the United States Air Force.",
  },
  combat_meritorious: {
    distinctive: "The distinctive accomplishments of {shortRank} {lastName} reflect credit upon {himself/herself} and the United States Air Force.",
    singularly_distinctive: "The singularly distinctive accomplishments of {shortRank} {lastName} reflect great credit upon {himself/herself} and the United States Air Force.",
    exceptionally_meritorious: "{shortRank} {lastName}'s extraordinary professionalism, dedication, and courage reflect great credit upon {himself/herself} and the United States Air Force.",
  },
  combat_valor: {
    distinctive: "{shortRank} {lastName}'s heroic actions reflect credit upon {himself/herself} and the United States Air Force.",
    singularly_distinctive: "{shortRank} {lastName}'s heroic actions reflect great credit upon {himself/herself} and the United States Air Force.",
    exceptionally_meritorious: "{shortRank} {lastName}'s heroic actions in the face of the enemy reflect great credit upon {himself/herself}, upholding the highest traditions of the United States Air Force.",
  },
};

// Common abbreviations that MUST be spelled out in citations
export const ABBREVIATIONS_TO_EXPAND: Record<string, string> = {
  "USAF": "United States Air Force",
  "USSF": "United States Space Force",
  "DoD": "Department of Defense",
  "AFB": "Air Force Base",
  "SFB": "Space Force Base",
  "ANG": "Air National Guard",
  "AFRC": "Air Force Reserve Command",
  "HQ": "Headquarters",
  "NCO": "Noncommissioned Officer",
  "SNCO": "Senior Noncommissioned Officer",
  "CGO": "Company Grade Officer",
  "FGO": "Field Grade Officer",
  "OIC": "Officer in Charge",
  "NCOIC": "Noncommissioned Officer in Charge",
  "TDY": "temporary duty",
  "PCS": "permanent change of station",
  "PME": "Professional Military Education",
  "ALS": "Airman Leadership School",
  "NCOA": "Noncommissioned Officer Academy",
  "SNCOA": "Senior Noncommissioned Officer Academy",
  "CC": "Commander",
  "CD": "Deputy Commander",
  "CCM": "Command Chief Master Sergeant",
  "1st Sgt": "First Sergeant",
  "Amn": "Airman",
  "A1C": "Airman First Class",
  "SrA": "Senior Airman",
  "SSgt": "Staff Sergeant",
  "TSgt": "Technical Sergeant",
  "MSgt": "Master Sergeant",
  "SMSgt": "Senior Master Sergeant",
  "CMSgt": "Chief Master Sergeant",
  "2d Lt": "Second Lieutenant",
  "1st Lt": "First Lieutenant",
  "Capt": "Captain",
  "Maj": "Major",
  "Lt Col": "Lieutenant Colonel",
  "Col": "Colonel",
  "Brig Gen": "Brigadier General",
  "Maj Gen": "Major General",
  "Lt Gen": "Lieutenant General",
  "Gen": "General",
  "MAJCOM": "Major Command",
  "NAF": "Numbered Air Force",
  "ACC": "Air Combat Command",
  "AMC": "Air Mobility Command",
  "AETC": "Air Education and Training Command",
  "AFMC": "Air Force Materiel Command",
  "AFSOC": "Air Force Special Operations Command",
  "AFGSC": "Air Force Global Strike Command",
  "PACAF": "Pacific Air Forces",
  "USAFE": "United States Air Forces in Europe",
  "CENTCOM": "Central Command",
  "EUCOM": "European Command",
  "INDOPACOM": "Indo-Pacific Command",
  "AFRICOM": "Africa Command",
  "SOUTHCOM": "Southern Command",
  "NORTHCOM": "Northern Command",
  "SOCOM": "Special Operations Command",
  "TRANSCOM": "Transportation Command",
  "STRATCOM": "Strategic Command",
  "CYBERCOM": "Cyber Command",
  "SPACECOM": "Space Command",
  "ISR": "Intelligence, Surveillance, and Reconnaissance",
  "C2": "Command and Control",
  "CBRN": "Chemical, Biological, Radiological, and Nuclear",
  "EOD": "Explosive Ordnance Disposal",
  "OSI": "Office of Special Investigations",
  "SF": "Security Forces",
  "CE": "Civil Engineering",
  "FSS": "Force Support Squadron",
  "MDG": "Medical Group",
  "MXG": "Maintenance Group",
  "OG": "Operations Group",
  "MSG": "Mission Support Group",
};

// Rank-appropriate action verbs
export const RANK_VERBS: Record<string, { primary: string[]; secondary: string[] }> = {
  junior_enlisted: {
    primary: ["Performed", "Executed", "Supported", "Completed"],
    secondary: ["Assisted", "Contributed", "Maintained", "Processed"],
  },
  nco: {
    primary: ["Led", "Managed", "Directed", "Coordinated"],
    secondary: ["Developed", "Implemented", "Trained", "Supervised"],
  },
  snco: {
    primary: ["Spearheaded", "Championed", "Orchestrated", "Drove"],
    secondary: ["Transformed", "Pioneered", "Established", "Architected"],
  },
  cgo: {
    primary: ["Directed", "Managed", "Led", "Coordinated"],
    secondary: ["Developed", "Implemented", "Oversaw", "Executed"],
  },
  fgo: {
    primary: ["Orchestrated", "Championed", "Spearheaded", "Drove"],
    secondary: ["Transformed", "Pioneered", "Established", "Shaped"],
  },
};

// Get verb category based on rank
export function getVerbCategory(rank: string): keyof typeof RANK_VERBS {
  const juniorEnlisted = ["AB", "Amn", "A1C", "SrA"];
  const nco = ["SSgt", "TSgt"];
  const snco = ["MSgt", "SMSgt", "CMSgt"];
  const cgo = ["2d Lt", "1st Lt", "Capt"];
  const fgo = ["Maj", "Lt Col", "Col", "Brig Gen", "Maj Gen", "Lt Gen", "Gen"];
  
  if (juniorEnlisted.includes(rank)) return "junior_enlisted";
  if (nco.includes(rank)) return "nco";
  if (snco.includes(rank)) return "snco";
  if (cgo.includes(rank)) return "cgo";
  if (fgo.includes(rank)) return "fgo";
  return "nco"; // default
}
