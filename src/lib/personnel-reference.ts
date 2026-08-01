/**
 * EPB personnel wording — never name subordinate ranks in performance statements.
 * Prefer generic groups (Airmen / members), hyphenated team sizes (3-mbr, 4-Amn team),
 * and joint / coalition framing for multi-service or partner-nation work.
 */

/** Prompt block injected into generate / revise flows. */
export const PERSONNEL_REFERENCE_GUIDANCE = `PERSONNEL REFERENCES (CRITICAL — NEVER VIOLATE):
- NEVER name specific ranks for people the ratee led, mentored, trained, guided, or worked with.
  Banned people descriptors: AB, A1C, SrA, SSgt, TSgt, MSgt, SMSgt, CMSgt, and officer ranks (2d Lt, 1st Lt, Capt, Maj, Lt Col, Col, etc.).
- Prefer generic group nouns: Airmen, members, personnel, teammates.
- When describing a TEAM / CREW / GROUP, use hyphenated size forms with digits:
  "3-mbr team", "4-Amn team", "6-mbr crew" — NOT "3 TSgts", "two SSgts", "2-person team", or "a pair of MSgts".
- Prefer "mbr" over "person/people" in team size forms ("2-mbr team", not "2-person team").
- Use digits for counts: "2 Airmen", not "two TSgts".
- "Amn" is ONLY allowed inside hyphenated team forms (e.g. "4-Amn team"), never as "two Amn" standing in for a specific grade.
- If source material names a rank (e.g. "TSgts"), REWRITE it to a generic form before outputting.

TEAM OPENER STRUCTURE (READABILITY — CRITICAL):
- Put the team AFTER a strong action verb as the object, then the work: [Verb] + [N-mbr team] + [what they did/through what].
- NEVER use awkward possessives on the team size: "Drove 2-person team's career development", "Led 3-mbr team's success", "Guided 4-Amn team's packages".
- NEVER make the abstract noun the object of a weak/mismatched verb ("Drove … career development"). Drive/lead a team through work; develop/mentor Airmen.
- Prefer natural mentorship/leadership frames:
  GOOD: "Mentored 2 Airmen through strat board packages…"
  GOOD: "Led 2-mbr team through strat board package reviews…"
  GOOD: "Guided 2 Airmen refining critical packages before deadline…"
  BAD: "Drove 2-person team's career development, refining 2 critical packages…"

JOINT / MULTI-SERVICE / COALITION (CRITICAL):
- When the ratee worked with other U.S. services (Army, Navy, Marine Corps / Marines, Coast Guard, Space Force) — alone or mixed with Airmen — frame as a joint team / joint mission / joint effort.
  Do NOT list every service as a laundry list of people ("Army Soldiers, Navy Sailors, and Marines…") unless a specific service is essential to the impact.
- Prefer: "joint team", "joint mission", "joint crew", "joint partners", "multi-service team".
- When the ratee worked with foreign military or partner-nation forces, frame as coalition partners / coalition team / coalition mission — not by naming every nation or foreign rank.
- Quantify when known: "led 8-mbr joint team", "synchronized joint mission with coalition partners".
- Keep AF-centric voice: the ratee led/enabled the joint or coalition effort; do not invent partner metrics.

BAD → GOOD:
- "Mentored two TSgts on strat board packages" → "Mentored 2 Airmen on strat board packages"
- "Mentored two TSgts on strat board packages" → "Mentored 2-mbr team through strat board packages"
- "Led 3 SSgts during network cutover" → "Led 3-mbr team during network cutover"
- "Guided TSgts through package reviews" → "Guided Airmen through package reviews"
- "Drove 2-person team's career development, refining packages…" → "Mentored 2 Airmen through critical package reviews…" / "Led 2-mbr team through package refinements…"
- "Worked with Army, Navy, and Marines on the exercise" → "Led joint team on the exercise" / "Enabled joint mission during the exercise"
- "Coordinated with Japanese and Australian forces" → "Synchronized coalition partners" / "Led coalition team"
- "Trained Marine Corps staff NCOs and Army NCOs" → "Trained joint partners" / "Mentored joint team members"`;

/** Specific grade abbreviations that must not appear as people descriptors in statements. */
const SPECIFIC_RANK_PATTERN =
  /\b(?:A1Cs?|SrAs?|SSgts?|TSgts?|MSgts?|SMSgts?|CMSgts?|2d\s*Lts?|1st\s*Lts?|Capts?|Majs?|Lt\s*Cols?|Cols?)\b/i;

/**
 * Detects specific rank labels that should be rewritten to generic personnel wording.
 * Intentionally ignores bare "Amn" / "Airmen" / "mbr" team forms (those are allowed).
 */
export function containsSpecificPersonnelRank(text: string): boolean {
  return SPECIFIC_RANK_PATTERN.test(text);
}
