import { NextResponse } from "next/server";
import {
  getResendApiKey,
  getTransactionalFromEmail,
  sendResendEmail,
} from "@/lib/email/resend";
import {
  allInactivityModesOff,
  resolveInactivityCaps,
  resolveInactivityModes,
} from "@/lib/inactivity/modes";
import { runInactivityJob } from "@/lib/inactivity/run";
import {
  createSupabaseInactivityStore,
  finishInactivityLock,
  tryInactivityLock,
} from "@/lib/inactivity/supabase-store";

export const maxDuration = 300;

function isAuthorizedCron(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const modes = resolveInactivityModes(process.env, url);
  const caps = resolveInactivityCaps(process.env);

  if (allInactivityModesOff(modes)) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      cancelled: 0,
      capped: false,
      notices: { mode: modes.notices, due: 0, sent: 0, skipped: 0, failed: 0, acted: 0 },
      suspend: { mode: modes.suspend, due: 0, sent: 0, skipped: 0, failed: 0, acted: 0 },
      delete: { mode: modes.delete, due: 0, sent: 0, skipped: 0, failed: 0, acted: 0 },
    });
  }

  let locked = false;
  try {
    locked = await tryInactivityLock();
  } catch {
    return NextResponse.json({ ok: false, error: "Lock failed" }, { status: 500 });
  }

  if (!locked) {
    return NextResponse.json(
      { ok: false, skipped: true, error: "Already running" },
      { status: 429 }
    );
  }

  try {
    const from = getTransactionalFromEmail();
    const apiKey = getResendApiKey();
    const result = await runInactivityJob({
      now: new Date(),
      modes,
      caps,
      store: createSupabaseInactivityStore(),
      mailer: {
        async send(input) {
          if (!from || !apiKey) {
            throw new Error("Transactional email is not configured");
          }
          return sendResendEmail({
            resendApiKey: apiKey,
            from,
            to: input.to,
            subject: input.subject,
            html: input.html,
            text: input.text,
            idempotencyKey: input.idempotencyKey,
            tags: input.tags,
          });
        },
      },
    });

    console.info("[inactivity-notices]", JSON.stringify(result));
    return NextResponse.json({ ok: true, ...result });
  } catch {
    console.error("[inactivity-notices] run failed");
    return NextResponse.json({ ok: false, error: "Run failed" }, { status: 500 });
  } finally {
    try {
      await finishInactivityLock();
    } catch {
      console.error("[inactivity-notices] unlock failed");
    }
  }
}
