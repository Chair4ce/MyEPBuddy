export const PROMPT_RULE_CONTEXTS = [
  "epb",
  "award",
  "decoration",
  "assessment",
  "opb",
  "war",
  "duty_description",
] as const;

export type PromptRuleContext = (typeof PROMPT_RULE_CONTEXTS)[number];

export const MAX_RULES_PER_CONTEXT = 25;
export const MAX_RULE_TEXT_LENGTH = 500;

export const PROMPT_RULE_CONTEXT_LABELS: Record<PromptRuleContext, string> = {
  epb: "EPB Statements",
  award: "Awards",
  decoration: "Decorations",
  assessment: "Assessments",
  opb: "OPB Statements",
  war: "WAR Synthesis",
  duty_description: "Duty Descriptions",
};

export const PROMPT_RULE_CONTEXT_DESCRIPTIONS: Record<PromptRuleContext, string> = {
  epb: "Rules applied when generating or revising EPB performance statements.",
  award: "Rules applied when generating award narratives (AF Form 1206).",
  decoration: "Rules applied when generating decoration citations.",
  assessment: "Rules applied when scoring EPBs and accomplishments.",
  opb: "Rules applied when generating OPB officer statements.",
  war: "Rules applied when synthesizing Weekly Activity Reports.",
  duty_description: "Rules applied when revising duty descriptions.",
};
