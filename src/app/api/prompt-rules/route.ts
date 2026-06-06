import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  MAX_RULES_PER_CONTEXT,
  MAX_RULE_TEXT_LENGTH,
  PROMPT_RULE_CONTEXTS,
} from "@/lib/prompt-rules/constants";
import type { PromptRule, PromptRuleContext } from "@/types/database";

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_MUTATIONS_PER_WINDOW = 30;

type RateLimitRecord = { count: number; resetAt: number };
const mutationRateLimits = new Map<string, RateLimitRecord>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const record = mutationRateLimits.get(userId);

  if (!record || now > record.resetAt) {
    mutationRateLimits.set(userId, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return true;
  }

  if (record.count >= MAX_MUTATIONS_PER_WINDOW) {
    return false;
  }

  record.count += 1;
  return true;
}

const contextSchema = z.enum(PROMPT_RULE_CONTEXTS);

const createRuleSchema = z.object({
  context: contextSchema,
  ruleText: z
    .string()
    .trim()
    .min(1, "Rule text is required")
    .max(MAX_RULE_TEXT_LENGTH),
  isActive: z.boolean().optional().default(true),
});

const updateRuleSchema = z.object({
  id: z.string().uuid(),
  ruleText: z
    .string()
    .trim()
    .min(1)
    .max(MAX_RULE_TEXT_LENGTH)
    .optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});

const deleteRuleSchema = z.object({
  id: z.string().uuid(),
});

async function countActiveRules(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  context: PromptRuleContext,
): Promise<number> {
  const { count, error } = await (supabase as unknown as {
    from: (table: string) => {
      select: (cols: string, opts: { count: string; head: boolean }) => {
        eq: (col: string, val: string) => {
          eq: (col2: string, val2: PromptRuleContext) => {
            eq: (col3: string, val3: boolean) => Promise<{
              count: number | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
  })
    .from("user_prompt_rules")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("context", context)
    .eq("is_active", true);

  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const contextParam = searchParams.get("context");
  const parsedContext = contextSchema.safeParse(contextParam);

  if (!parsedContext.success) {
    return NextResponse.json({ error: "Invalid context" }, { status: 400 });
  }

  const { data, error } = await (supabase as unknown as {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          eq: (col2: string, val2: PromptRuleContext) => {
            order: (
              col3: string,
              opts: { ascending: boolean },
            ) => {
              order: (
                col4: string,
                opts2: { ascending: boolean },
              ) => Promise<{
                data: PromptRule[] | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
      };
    };
  })
    .from("user_prompt_rules")
    .select("*")
    .eq("user_id", user.id)
    .eq("context", parsedContext.data)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Failed to load rules" }, { status: 500 });
  }

  return NextResponse.json({ rules: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!checkRateLimit(user.id)) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createRuleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  const { context, ruleText, isActive } = parsed.data;

  try {
    if (isActive) {
      const activeCount = await countActiveRules(supabase, user.id, context);
      if (activeCount >= MAX_RULES_PER_CONTEXT) {
        return NextResponse.json(
          {
            error: `Maximum ${MAX_RULES_PER_CONTEXT} active rules per context.`,
          },
          { status: 400 },
        );
      }
    }

    const { data: maxRow } = await (supabase as unknown as {
      from: (table: string) => {
        select: (cols: string) => {
          eq: (col: string, val: string) => {
            eq: (col2: string, val2: PromptRuleContext) => {
              order: (
                col3: string,
                opts: { ascending: boolean },
              ) => {
                limit: (n: number) => {
                  maybeSingle: () => Promise<{
                    data: { sort_order: number } | null;
                    error: unknown;
                  }>;
                };
              };
            };
          };
        };
      };
    })
      .from("user_prompt_rules")
      .select("sort_order")
      .eq("user_id", user.id)
      .eq("context", context)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextSortOrder = (maxRow?.sort_order ?? -1) + 1;

    const { data, error } = await (supabase as unknown as {
      from: (table: string) => {
        insert: (row: Record<string, unknown>) => {
          select: (cols: string) => {
            single: () => Promise<{
              data: PromptRule | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    })
      .from("user_prompt_rules")
      .insert({
        user_id: user.id,
        context,
        rule_text: ruleText,
        is_active: isActive,
        sort_order: nextSortOrder,
      })
      .select("*")
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Failed to create rule" }, { status: 500 });
    }

    return NextResponse.json({ rule: data }, { status: 201 });
  } catch (err) {
    console.error("[prompt-rules] POST error:", err);
    return NextResponse.json({ error: "Failed to create rule" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!checkRateLimit(user.id)) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = updateRuleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  const { id, ruleText, isActive, sortOrder } = parsed.data;

  const { data: existing, error: fetchError } = await (supabase as unknown as {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          eq: (col2: string, val2: string) => {
            maybeSingle: () => Promise<{
              data: PromptRule | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
  })
    .from("user_prompt_rules")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchError || !existing) {
    return NextResponse.json({ error: "Rule not found" }, { status: 404 });
  }

  if (isActive === true && !existing.is_active) {
    try {
      const activeCount = await countActiveRules(
        supabase,
        user.id,
        existing.context,
      );
      if (activeCount >= MAX_RULES_PER_CONTEXT) {
        return NextResponse.json(
          {
            error: `Maximum ${MAX_RULES_PER_CONTEXT} active rules per context.`,
          },
          { status: 400 },
        );
      }
    } catch (err) {
      console.error("[prompt-rules] PATCH count error:", err);
      return NextResponse.json({ error: "Failed to update rule" }, { status: 500 });
    }
  }

  const updates: Record<string, unknown> = {};
  if (ruleText !== undefined) updates.rule_text = ruleText;
  if (isActive !== undefined) updates.is_active = isActive;
  if (sortOrder !== undefined) updates.sort_order = sortOrder;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ rule: existing });
  }

  const { data, error } = await (supabase as unknown as {
    from: (table: string) => {
      update: (row: Record<string, unknown>) => {
        eq: (col: string, val: string) => {
          eq: (col2: string, val2: string) => {
            select: (cols: string) => {
              single: () => Promise<{
                data: PromptRule | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
      };
    };
  })
    .from("user_prompt_rules")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Failed to update rule" }, { status: 500 });
  }

  return NextResponse.json({ rule: data });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!checkRateLimit(user.id)) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = deleteRuleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { error } = await (supabase as unknown as {
    from: (table: string) => {
      delete: () => {
        eq: (col: string, val: string) => {
          eq: (col2: string, val2: string) => Promise<{
            error: { message: string } | null;
          }>;
        };
      };
    };
  })
    .from("user_prompt_rules")
    .delete()
    .eq("id", parsed.data.id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: "Failed to delete rule" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
