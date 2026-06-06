import { createClient } from "@/lib/supabase/server";
import { isPromptRulesMode, type AppFeatureFlags } from "@/lib/feature-flags";
import { getAppFeatureFlags } from "@/lib/feature-flags/server";
import type { PromptRule, PromptRuleContext } from "@/types/database";

const USER_RULES_HEADER = `=== USER-DEFINED RULES (MANDATORY — OVERRIDE CONFLICTS ABOVE) ===
You MUST strictly follow every rule below. If any rule conflicts with earlier instructions in this prompt, the user's rule takes precedence and replaces that instruction.`;

export function buildUserRulesSection(rules: string[]): string {
  if (rules.length === 0) return "";

  const numbered = rules
    .map((rule, index) => `${index + 1}. ${rule.trim()}`)
    .join("\n");

  return `\n\n${USER_RULES_HEADER}\n${numbered}`;
}

export async function getActiveRulesForContext(
  userId: string,
  context: PromptRuleContext,
): Promise<string[]> {
  const flags = await getAppFeatureFlags();
  if (!flags.enablePromptRules) return [];

  const supabase = await createClient();

  const { data, error } = await (supabase as unknown as {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          eq: (col2: string, val2: boolean) => {
            eq: (col3: string, val3: string) => {
              order: (
                col4: string,
                opts: { ascending: boolean },
              ) => {
                order: (
                  col5: string,
                  opts2: { ascending: boolean },
                ) => Promise<{
                  data: Pick<PromptRule, "rule_text">[] | null;
                  error: { message: string } | null;
                }>;
              };
            };
          };
        };
      };
    };
  })
    .from("user_prompt_rules")
    .select("rule_text")
    .eq("user_id", userId)
    .eq("is_active", true)
    .eq("context", context)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[prompt-rules] fetch error:", error.message);
    return [];
  }

  return (data ?? [])
    .map((row) => row.rule_text.trim())
    .filter((text) => text.length > 0);
}

/** Fetch rules and append the mandatory override section to a base prompt. */
export async function appendUserRulesToPrompt(
  basePrompt: string,
  userId: string,
  context: PromptRuleContext,
): Promise<string> {
  const rules = await getActiveRulesForContext(userId, context);
  const section = buildUserRulesSection(rules);
  if (!section) return basePrompt;
  return `${basePrompt}${section}`;
}

/** When rules mode is on, ignore stored custom prompt text and use canonical default. */
export function resolvePromptWithRulesMode<T extends string>(
  stored: string | null | undefined,
  canonicalDefault: T,
  flags: AppFeatureFlags,
  resolver: (stored: string | null | undefined) => string = (value) =>
    value?.trim() ? value! : canonicalDefault,
): string {
  if (isPromptRulesMode(flags)) {
    return canonicalDefault;
  }
  return resolver(stored);
}
