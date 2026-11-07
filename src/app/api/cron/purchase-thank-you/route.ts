import { NextResponse } from "next/server";
import { createPurchaseThankYouMailer, createPurchaseThankYouStore } from "@/lib/billing/purchase-thank-you-store";
import { retryPurchaseThankYous } from "@/lib/billing/purchase-thank-you-run";

export const maxDuration = 60;

function isAuthorizedCron(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const store = createPurchaseThankYouStore();
    const result = await retryPurchaseThankYous({
      env: process.env,
      now: new Date(),
      activate: (cutoff) => store.activate(cutoff),
      prepare: (input) => store.prepare(input),
      mark: (input) => store.mark(input),
      expire: (now) => store.expire(now),
      candidates: (now) => store.candidates(now),
      mailer: createPurchaseThankYouMailer(),
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[purchase-thank-you] retry failed", error);
    return NextResponse.json({ ok: false, error: "Run failed" }, { status: 500 });
  }
}
