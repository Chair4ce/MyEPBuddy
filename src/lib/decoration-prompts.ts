/**
 * System prompts for Air Force Decoration Citation Generation
 * Based on DAFMAN 36-2806 and AFI 36-2803
 */

import type { DecorationAwardType, DecorationReason } from "./decoration-constants";
import { DECORATION_TYPES, RANK_VERBS, getVerbCategory } from "./decoration-constants";

interface DecorationPromptParams {
  awardType: DecorationAwardType;
  reason: DecorationReason;
  rank: string;
  fullName: string;
  dutyTitle: string;
  unit: string;
  startDate: string;
  endDate: string;
  accomplishments: string[];
  fontSize: 10 | 12;
  gender?: "male" | "female";
}

export function buildDecorationSystemPrompt(params: DecorationPromptParams): string {
  const config = DECORATION_TYPES.find(d => d.key === params.awardType);
  if (!config) throw new Error(`Unknown award type: ${params.awardType}`);
  
  const maxLines = params.fontSize === 12 ? config.maxLines12pt : config.maxLines10pt;
  const verbCategory = getVerbCategory(params.rank);
  const verbs = RANK_VERBS[verbCategory];
  const pronoun = params.gender === "female" ? "herself" : "himself";
  const possessive = params.gender === "female" ? "her" : "his";
  
  // Get short rank title for narrative
  const shortRank = getShortRank(params.rank);
  
  return `You are an expert Air Force decoration citation writer with extensive knowledge of DAFMAN 36-2806 and AFI 36-2803. Generate a ${config.name} (${config.abbreviation}) citation.

## CITATION REQUIREMENTS

**Award:** ${config.name}
**Maximum Lines:** ${maxLines} lines at ${params.fontSize}-point Times New Roman font
**Typical Recipients:** ${config.typicalRanks}

## RATEE INFORMATION

**Rank:** ${params.rank}
**Full Name:** ${params.fullName}
**Duty Title:** ${params.dutyTitle}
**Unit:** ${params.unit}
**Period:** ${params.startDate} to ${params.endDate}
**Award Reason:** ${formatReason(params.reason)}

## MANDATORY FORMAT RULES

1. **SPELL OUT ALL ABBREVIATIONS** - No abbreviations except Jr., Sr., II, III
   - Write "United States Air Force" not "USAF"
   - Write "Air Force Base" not "AFB"
   - Write "Department of Defense" not "DoD"
   - Write "Noncommissioned Officer" not "NCO"
   - All unit designations must be spelled out

2. **NO SYMBOLS** except the dollar sign ($)
   - Write "percent" not "%"
   - Write numbers out when appropriate

3. **DATE FORMAT** - No leading zeros (use "1 January" not "01 January")

4. **RANK FORMATTING**
   - First mention: Full rank with name ("${params.rank} ${params.fullName}")
   - Subsequent mentions: Short rank with last name ("${shortRank} ${getLastName(params.fullName)}")
   - Never separate rank from name

5. **PRONOUN CONSISTENCY** - Use "${pronoun}" and "${possessive}" throughout

## CITATION STRUCTURE

The citation MUST follow this exact structure:

### OPENING SENTENCE (Mandatory Template)
${getOpeningTemplate(params)}

### NARRATIVE (Your Focus)
- Start with: "During this period," or "In this important assignment,"
- 2-5 sentences describing accomplishments with quantified impacts
- Use transitions: "Additionally," "Furthermore," "Moreover," "Finally,"
- Each accomplishment should have: ACTION → SCOPE → IMPACT
- Use rank-appropriate action verbs:
  - Primary: ${verbs.primary.join(", ")}
  - Secondary: ${verbs.secondary.join(", ")}

### CLOSING SENTENCE (Mandatory Template)
${getClosingTemplate(params, config.closingIntensity)}

## ACCOMPLISHMENTS TO INCORPORATE

${params.accomplishments.map((a, i) => `${i + 1}. ${a}`).join("\n")}

## QUALITY STANDARDS

- Capture SUBSTANCE with DIGNITY and CLARITY
- Use ACTIVE VOICE and FORCEFUL VERBS
- Be SPECIFIC with facts and metrics
- Emphasize MISSION CONTRIBUTION
- Flow naturally as a single cohesive narrative
- Stay within ${maxLines} lines

## OUTPUT

Generate ONLY the complete citation text. Do not include any headers, notes, or explanations. The citation should be ready to paste directly onto ${config.afForm}.`;
}

function getOpeningTemplate(params: DecorationPromptParams): string {
  const pronoun = params.gender === "female" ? "herself" : "himself";
  
  const templates: Record<DecorationAwardType, Record<string, string>> = {
    afam: {
      meritorious_service: `${params.rank} ${params.fullName} distinguished ${pronoun} by meritorious service as ${params.dutyTitle}, ${params.unit}.`,
      outstanding_achievement: `${params.rank} ${params.fullName} distinguished ${pronoun} by outstanding achievement as ${params.dutyTitle}, ${params.unit}, from ${params.startDate} to ${params.endDate}.`,
      default: `${params.rank} ${params.fullName} distinguished ${pronoun} by outstanding achievement as ${params.dutyTitle}, ${params.unit}.`,
    },
    afcm: {
      meritorious_service: `${params.rank} ${params.fullName} distinguished ${pronoun} by meritorious service as ${params.dutyTitle}, ${params.unit}, from ${params.startDate} to ${params.endDate}.`,
      outstanding_achievement: `${params.rank} ${params.fullName} distinguished ${pronoun} by outstanding achievement as ${params.dutyTitle}, ${params.unit}, from ${params.startDate} to ${params.endDate}.`,
      act_of_courage: `${params.rank} ${params.fullName} distinguished ${pronoun} by an act of courage as ${params.dutyTitle}, ${params.unit}.`,
      default: `${params.rank} ${params.fullName} distinguished ${pronoun} by meritorious service as ${params.dutyTitle}, ${params.unit}.`,
    },
    msm: {
      meritorious_service: `${params.rank} ${params.fullName} distinguished ${pronoun} in the performance of outstanding service to the United States as ${params.dutyTitle}, ${params.unit}, from ${params.startDate} to ${params.endDate}.`,
      outstanding_achievement: `${params.rank} ${params.fullName} distinguished ${pronoun} by outstanding achievement as ${params.dutyTitle}, ${params.unit}, from ${params.startDate} to ${params.endDate}.`,
      retirement: `${params.rank} ${params.fullName} distinguished ${pronoun} in the performance of outstanding service to the United States as ${params.dutyTitle}, ${params.unit}, from ${params.startDate} to ${params.endDate}.`,
      default: `${params.rank} ${params.fullName} distinguished ${pronoun} in the performance of outstanding service to the United States as ${params.dutyTitle}, ${params.unit}.`,
    },
    lom: {
      meritorious_service: `${params.rank} ${params.fullName} distinguished ${pronoun} by exceptionally meritorious conduct in the performance of outstanding service to the United States as ${params.dutyTitle}, ${params.unit}, from ${params.startDate} to ${params.endDate}.`,
      retirement: `${params.rank} ${params.fullName} distinguished ${pronoun} by exceptionally meritorious conduct in the performance of outstanding service to the United States as ${params.dutyTitle}, ${params.unit}, from ${params.startDate} to ${params.endDate}.`,
      default: `${params.rank} ${params.fullName} distinguished ${pronoun} by exceptionally meritorious conduct in the performance of outstanding service as ${params.dutyTitle}, ${params.unit}.`,
    },
    bsm: {
      combat_meritorious: `${params.rank} ${params.fullName} distinguished ${pronoun} by meritorious service in connection with military operations against an armed enemy while serving as ${params.dutyTitle}, ${params.unit}, from ${params.startDate} to ${params.endDate}.`,
      combat_valor: `${params.rank} ${params.fullName} distinguished ${pronoun} by heroic achievement in connection with combat operations against an armed enemy while serving as ${params.dutyTitle}, ${params.unit}.`,
      default: `${params.rank} ${params.fullName} distinguished ${pronoun} by meritorious achievement in connection with military operations as ${params.dutyTitle}, ${params.unit}.`,
    },
  };
  
  const awardTemplates = templates[params.awardType];
  return awardTemplates[params.reason] || awardTemplates.default;
}

function getClosingTemplate(
  params: DecorationPromptParams, 
  intensity: "distinctive" | "singularly_distinctive" | "exceptionally_meritorious"
): string {
  const shortRank = getShortRank(params.rank);
  const lastName = getLastName(params.fullName);
  const pronoun = params.gender === "female" ? "herself" : "himself";
  const possessive = params.gender === "female" ? "her" : "his";
  
  const closings: Record<DecorationReason, Record<string, string>> = {
    meritorious_service: {
      distinctive: `The distinctive accomplishments of ${shortRank} ${lastName} reflect credit upon ${pronoun} and the United States Air Force.`,
      singularly_distinctive: `The singularly distinctive accomplishments of ${shortRank} ${lastName} reflect great credit upon ${pronoun} and the United States Air Force.`,
      exceptionally_meritorious: `The exceptionally meritorious accomplishments of ${shortRank} ${lastName} reflect great credit upon ${pronoun} and the United States Air Force.`,
    },
    outstanding_achievement: {
      distinctive: `The distinctive accomplishments of ${shortRank} ${lastName} reflect credit upon ${pronoun} and the United States Air Force.`,
      singularly_distinctive: `The singularly distinctive accomplishments of ${shortRank} ${lastName} reflect great credit upon ${pronoun} and the United States Air Force.`,
      exceptionally_meritorious: `The exceptionally meritorious accomplishments of ${shortRank} ${lastName} reflect great credit upon ${pronoun} and the United States Air Force.`,
    },
    retirement: {
      distinctive: `The distinctive accomplishments of ${shortRank} ${lastName} culminate a distinguished career in the service of ${possessive} country and reflect credit upon ${pronoun} and the United States Air Force.`,
      singularly_distinctive: `The singularly distinctive accomplishments of ${shortRank} ${lastName} culminate a long and distinguished career in the service of ${possessive} country and reflect great credit upon ${pronoun} and the United States Air Force.`,
      exceptionally_meritorious: `The singularly distinctive accomplishments of ${shortRank} ${lastName} culminate a long and distinguished career in the service of ${possessive} country and reflect great credit upon ${pronoun} and the United States Air Force.`,
    },
    separation: {
      distinctive: `The distinctive accomplishments of ${shortRank} ${lastName} while serving ${possessive} country reflect credit upon ${pronoun} and the United States Air Force.`,
      singularly_distinctive: `The singularly distinctive accomplishments of ${shortRank} ${lastName} while serving ${possessive} country reflect great credit upon ${pronoun} and the United States Air Force.`,
      exceptionally_meritorious: `The singularly distinctive accomplishments of ${shortRank} ${lastName} while serving ${possessive} country reflect great credit upon ${pronoun} and the United States Air Force.`,
    },
    posthumous: {
      distinctive: `The distinctive accomplishments of ${shortRank} ${lastName} in the dedication of ${possessive} service to ${possessive} country reflect credit upon ${pronoun} and the United States Air Force.`,
      singularly_distinctive: `The singularly distinctive accomplishments of ${shortRank} ${lastName} in the dedication of ${possessive} service to ${possessive} country reflect great credit upon ${pronoun} and the United States Air Force.`,
      exceptionally_meritorious: `The singularly distinctive accomplishments of ${shortRank} ${lastName} in the dedication of ${possessive} service to ${possessive} country reflect great credit upon ${pronoun} and the United States Air Force.`,
    },
    act_of_courage: {
      distinctive: `By ${possessive} prompt action and humanitarian regard for ${possessive} fellowman, ${shortRank} ${lastName} has reflected credit upon ${pronoun} and the United States Air Force.`,
      singularly_distinctive: `By ${possessive} prompt action and humanitarian regard for ${possessive} fellowman, ${shortRank} ${lastName} has reflected great credit upon ${pronoun} and the United States Air Force.`,
      exceptionally_meritorious: `By ${possessive} prompt action and humanitarian regard for ${possessive} fellowman, ${shortRank} ${lastName} has reflected great credit upon ${pronoun} and the United States Air Force.`,
    },
    combat_meritorious: {
      distinctive: `The distinctive accomplishments of ${shortRank} ${lastName} reflect credit upon ${pronoun} and the United States Air Force.`,
      singularly_distinctive: `The singularly distinctive accomplishments of ${shortRank} ${lastName} reflect great credit upon ${pronoun} and the United States Air Force.`,
      exceptionally_meritorious: `${shortRank} ${lastName}'s extraordinary professionalism, dedication, and courage reflect great credit upon ${pronoun} and the United States Air Force.`,
    },
    combat_valor: {
      distinctive: `${shortRank} ${lastName}'s heroic actions reflect credit upon ${pronoun} and the United States Air Force.`,
      singularly_distinctive: `${shortRank} ${lastName}'s heroic actions reflect great credit upon ${pronoun} and the United States Air Force.`,
      exceptionally_meritorious: `${shortRank} ${lastName}'s heroic actions in the face of the enemy reflect great credit upon ${pronoun}, upholding the highest traditions of the United States Air Force.`,
    },
  };
  
  const reasonClosings = closings[params.reason] || closings.meritorious_service;
  return reasonClosings[intensity] || reasonClosings.distinctive;
}

function getShortRank(rank: string): string {
  const shortRanks: Record<string, string> = {
    "Airman Basic": "Airman",
    "AB": "Airman",
    "Airman": "Airman",
    "Amn": "Airman",
    "Airman First Class": "Airman",
    "A1C": "Airman",
    "Senior Airman": "Airman",
    "SrA": "Airman",
    "Staff Sergeant": "Sergeant",
    "SSgt": "Sergeant",
    "Technical Sergeant": "Sergeant",
    "TSgt": "Sergeant",
    "Master Sergeant": "Sergeant",
    "MSgt": "Sergeant",
    "Senior Master Sergeant": "Sergeant",
    "SMSgt": "Sergeant",
    "Chief Master Sergeant": "Chief",
    "CMSgt": "Chief",
    "Second Lieutenant": "Lieutenant",
    "2d Lt": "Lieutenant",
    "First Lieutenant": "Lieutenant",
    "1st Lt": "Lieutenant",
    "Captain": "Captain",
    "Capt": "Captain",
    "Major": "Major",
    "Maj": "Major",
    "Lieutenant Colonel": "Colonel",
    "Lt Col": "Colonel",
    "Colonel": "Colonel",
    "Col": "Colonel",
    "Brigadier General": "General",
    "Brig Gen": "General",
    "Major General": "General",
    "Maj Gen": "General",
    "Lieutenant General": "General",
    "Lt Gen": "General",
    "General": "General",
    "Gen": "General",
  };
  return shortRanks[rank] || rank;
}

function getLastName(fullName: string): string {
  const parts = fullName.trim().split(" ");
  return parts[parts.length - 1];
}

function formatReason(reason: DecorationReason): string {
  const labels: Record<DecorationReason, string> = {
    meritorious_service: "Meritorious Service (extended period)",
    outstanding_achievement: "Outstanding Achievement (specific accomplishment)",
    act_of_courage: "Act of Courage (non-combat heroism)",
    retirement: "Retirement",
    separation: "Separation",
    posthumous: "Posthumous",
    combat_meritorious: "Combat Meritorious Service",
    combat_valor: "Combat Valor",
  };
  return labels[reason] || reason;
}

// Post-processing function to expand any remaining abbreviations
export function expandAbbreviations(text: string): string {
  const abbreviations: Record<string, string> = {
    "\\bUSAF\\b": "United States Air Force",
    "\\bUSSF\\b": "United States Space Force",
    "\\bDoD\\b": "Department of Defense",
    "\\bAFB\\b": "Air Force Base",
    "\\bSFB\\b": "Space Force Base",
    "\\bNCO\\b": "Noncommissioned Officer",
    "\\bSNCO\\b": "Senior Noncommissioned Officer",
    "\\bNOIC\\b": "Noncommissioned Officer in Charge",
    "\\bOIC\\b": "Officer in Charge",
    "\\bTDY\\b": "temporary duty",
    "\\bPCS\\b": "permanent change of station",
    "\\bPME\\b": "Professional Military Education",
    "\\bALS\\b": "Airman Leadership School",
    "\\bNCOA\\b": "Noncommissioned Officer Academy",
    "\\bISR\\b": "Intelligence, Surveillance, and Reconnaissance",
    "\\bEOD\\b": "Explosive Ordnance Disposal",
    "\\bCBRN\\b": "Chemical, Biological, Radiological, and Nuclear",
    "\\bMAJCOM\\b": "Major Command",
    "\\bACC\\b": "Air Combat Command",
    "\\bAMC\\b": "Air Mobility Command",
    "\\bAETC\\b": "Air Education and Training Command",
    "\\bAFMC\\b": "Air Force Materiel Command",
    "\\bPACAF\\b": "Pacific Air Forces",
    "\\bUSAFE\\b": "United States Air Forces in Europe",
    "\\bCENTCOM\\b": "Central Command",
    "\\bAFCENT\\b": "Air Forces Central Command",
  };
  
  let result = text;
  for (const [pattern, replacement] of Object.entries(abbreviations)) {
    result = result.replace(new RegExp(pattern, "gi"), replacement);
  }
  
  // Replace % with percent
  result = result.replace(/(\d+)%/g, "$1 percent");
  
  return result;
}
