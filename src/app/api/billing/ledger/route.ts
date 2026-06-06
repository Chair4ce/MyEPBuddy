import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { LEDGER_PAGE_SIZE } from "@/lib/billing/constants";

const MAX_PAGE_SIZE = 50;

function parsePositiveInt(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = parsePositiveInt(searchParams.get("page"), 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    parsePositiveInt(searchParams.get("pageSize"), LEDGER_PAGE_SIZE),
  );
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await (supabase as unknown as {
    from: (table: string) => {
      select: (
        cols: string,
        opts: { count: "exact" },
      ) => {
        eq: (col: string, val: string) => {
          order: (
            col: string,
            opts: { ascending: boolean },
          ) => {
            range: (
              from: number,
              to: number,
            ) => Promise<{
              data: unknown[] | null;
              error: { message: string } | null;
              count: number | null;
            }>;
          };
        };
      };
    };
  })
    .from("credit_transactions")
    .select(
      "id, type, amount, balance_after, action_type, description, created_at",
      { count: "exact" },
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    console.error("[billing/ledger]", error.message);
    return NextResponse.json(
      { error: "Unable to load credit ledger" },
      { status: 500 },
    );
  }

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return NextResponse.json({
    transactions: data ?? [],
    pagination: {
      page: Math.min(page, totalPages),
      pageSize,
      totalCount,
      totalPages,
      hasPrevious: page > 1,
      hasNext: page < totalPages,
    },
  });
}
