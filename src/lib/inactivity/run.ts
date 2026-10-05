import { buildInactivityNoticeEmail } from "@/lib/email/inactivity-notice";
import {
  anyInactivityModeLive,
  type InactivityCaps,
  type InactivityMode,
  type InactivityModes,
} from "@/lib/inactivity/modes";
import { redactInactivityError } from "@/lib/inactivity/redact";
import {
  addDays,
  earliestDeleteAt,
  earliestSuspendAt,
  INACTIVITY_DELETE_AFTER_SUSPEND_DAYS,
  inactivityIdempotencyKey,
  phoenixDayStart,
  phoenixWeekStart,
  suspendDateHonorsRule,
  type InactivityNoticeKind,
} from "@/lib/inactivity/schedule";

export type InactivityStage = "notice_60" | "notice_30" | "suspended" | "deleted";

export type InactivityDueRow = {
  user_id: string;
  email: string;
  activity_at: string;
  due_stage: InactivityStage;
  scheduled_suspend_at: string;
  scheduled_delete_at: string;
  notice_60_sent_at: string | null;
  notice_30_sent_at: string | null;
  already_suspended: boolean;
  email_suppressed: boolean;
  suspended_at: string | null;
};

export type InactivityStore = {
  cancelStale(nowIso: string): Promise<number>;
  due(stage: InactivityStage, limit: number, nowIso: string): Promise<InactivityDueRow[]>;
  sentCount(sinceIso: string, types: InactivityStage[]): Promise<number>;
  claim(row: InactivityDueRow): Promise<string | null>;
  markSent(id: string, resendEmailId: string | null, nowIso: string): Promise<void>;
  markFailed(id: string, error: string): Promise<void>;
  markSkipped(id: string, reason: string): Promise<void>;
  suspendUser(userId: string, atIso: string): Promise<void>;
  deleteUser(userId: string): Promise<void>;
};

export type InactivityMailer = {
  send(input: {
    to: string;
    subject: string;
    html: string;
    text: string;
    idempotencyKey: string;
    tags: { name: string; value: string }[];
  }): Promise<{ id: string | null }>;
};

export type InactivityStageResult = {
  mode: InactivityMode;
  due: number;
  sent: number;
  skipped: number;
  failed: number;
  acted: number;
};

export type InactivityRunResult = {
  cancelled: number;
  capped: boolean;
  notices: InactivityStageResult;
  suspend: InactivityStageResult;
  delete: InactivityStageResult;
};

const NOTICE_TAG: Record<InactivityNoticeKind, string> = {
  notice_60: "60",
  notice_30: "30",
  suspended: "suspended",
};

function emptyStage(mode: InactivityMode): InactivityStageResult {
  return { mode, due: 0, sent: 0, skipped: 0, failed: 0, acted: 0 };
}

function stageHonorsRules(row: InactivityDueRow, now: Date): boolean {
  const activityAt = new Date(row.activity_at);
  const notice60SentAt = row.notice_60_sent_at ? new Date(row.notice_60_sent_at) : null;
  const notice30SentAt = row.notice_30_sent_at ? new Date(row.notice_30_sent_at) : null;

  if (row.due_stage === "deleted") {
    if (!row.suspended_at) return false;
    return suspendDateHonorsRule(
      row.scheduled_delete_at,
      earliestDeleteAt(activityAt, new Date(row.suspended_at))
    );
  }

  const kind = row.due_stage;
  let earliest;
  try {
    earliest = earliestSuspendAt({
      now,
      activityAt,
      stage: kind,
      notice60SentAt,
      notice30SentAt,
    });
  } catch {
    return false;
  }

  if (!suspendDateHonorsRule(row.scheduled_suspend_at, earliest)) return false;
  return suspendDateHonorsRule(
    row.scheduled_delete_at,
    addDays(new Date(row.scheduled_suspend_at), INACTIVITY_DELETE_AFTER_SUSPEND_DAYS)
  );
}

async function recordRuleFailure(
  store: InactivityStore,
  row: InactivityDueRow,
  live: boolean,
  stage: InactivityStageResult
) {
  stage.failed += 1;
  if (!live) return;
  const id = await store.claim(row);
  if (!id) return;
  await store.markFailed(id, "Rejected because the stated date shortened a warning period");
}

async function sendRow(input: {
  store: InactivityStore;
  mailer: InactivityMailer;
  row: InactivityDueRow;
  nowIso: string;
  stage: InactivityStageResult;
}) {
  const kind = input.row.due_stage as InactivityNoticeKind;
  const email = buildInactivityNoticeEmail({
    kind,
    activityAt: input.row.activity_at,
    suspendAt: input.row.scheduled_suspend_at,
    deleteAt: input.row.scheduled_delete_at,
  });
  const id = await input.store.claim(input.row);
  if (!id) return;

  try {
    const sent = await input.mailer.send({
      to: input.row.email,
      subject: email.subject,
      html: email.html,
      text: email.text,
      idempotencyKey: inactivityIdempotencyKey(
        input.row.user_id,
        input.row.due_stage,
        input.row.activity_at
      ),
      tags: [
        { name: "category", value: "inactivity" },
        { name: "notice", value: NOTICE_TAG[kind] },
      ],
    });
    await input.store.markSent(id, sent.id, input.nowIso);
    input.stage.sent += 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email send failed";
    await input.store.markFailed(id, redactInactivityError(message));
    input.stage.failed += 1;
  }
}

export async function runInactivityJob(input: {
  now: Date;
  modes: InactivityModes;
  caps: InactivityCaps;
  store: InactivityStore;
  mailer: InactivityMailer;
}): Promise<InactivityRunResult> {
  const nowIso = input.now.toISOString();
  const result: InactivityRunResult = {
    cancelled: 0,
    capped: false,
    notices: emptyStage(input.modes.notices),
    suspend: emptyStage(input.modes.suspend),
    delete: emptyStage(input.modes.delete),
  };

  if (anyInactivityModeLive(input.modes)) {
    result.cancelled = await input.store.cancelStale(nowIso);
  }

  let emailRemaining = input.caps.noticeDaily;
  if (input.modes.notices !== "off" || input.modes.suspend === "live") {
    const sentToday = await input.store.sentCount(phoenixDayStart(input.now).toISOString(), [
      "notice_60",
      "notice_30",
      "suspended",
    ]);
    emailRemaining = Math.max(0, input.caps.noticeDaily - sentToday);
  }

  if (input.modes.notices !== "off") {
    for (const stage of ["notice_60", "notice_30"] as const) {
      await processNoticeStage({
        stage,
        mode: input.modes.notices,
        now: input.now,
        nowIso,
        store: input.store,
        mailer: input.mailer,
        target: result.notices,
        emailRemaining: () => emailRemaining,
        consumeEmail: () => {
          emailRemaining -= 1;
        },
        markCapped: () => {
          result.capped = true;
        },
      });
    }
  }

  if (input.modes.suspend !== "off") {
    await processSuspendStage({
      mode: input.modes.suspend,
      cap: input.caps.suspendPerRun,
      now: input.now,
      nowIso,
      store: input.store,
      mailer: input.mailer,
      target: result.suspend,
      emailRemaining: () => emailRemaining,
      consumeEmail: () => {
        emailRemaining -= 1;
      },
      markCapped: () => {
        result.capped = true;
      },
    });
  }

  if (input.modes.delete !== "off") {
    await processDeleteStage({
      mode: input.modes.delete,
      cap: input.caps.deleteWeekly,
      now: input.now,
      nowIso,
      store: input.store,
      target: result.delete,
      markCapped: () => {
        result.capped = true;
      },
    });
  }

  return result;
}

async function processNoticeStage(input: {
  stage: "notice_60" | "notice_30";
  mode: InactivityMode;
  now: Date;
  nowIso: string;
  store: InactivityStore;
  mailer: InactivityMailer;
  target: InactivityStageResult;
  emailRemaining: () => number;
  consumeEmail: () => void;
  markCapped: () => void;
}) {
  const remaining = input.emailRemaining();
  if (remaining <= 0) {
    input.markCapped();
    return;
  }

  const live = input.mode === "live";
  const rows = await input.store.due(input.stage, Math.min(100, remaining + 1), input.nowIso);
  const actionable = rows.slice(0, remaining);
  if (rows.length > remaining) input.markCapped();

  for (const row of actionable) {
    input.target.due += 1;
    if (!stageHonorsRules(row, input.now)) {
      await recordRuleFailure(input.store, row, live, input.target);
      continue;
    }
    if (!live) continue;
    const before = input.target.sent;
    await sendRow({
      store: input.store,
      mailer: input.mailer,
      row,
      nowIso: input.nowIso,
      stage: input.target,
    });
    if (input.target.sent > before) input.consumeEmail();
  }
}

async function processSuspendStage(input: {
  mode: InactivityMode;
  cap: number;
  now: Date;
  nowIso: string;
  store: InactivityStore;
  mailer: InactivityMailer;
  target: InactivityStageResult;
  emailRemaining: () => number;
  consumeEmail: () => void;
  markCapped: () => void;
}) {
  const live = input.mode === "live";
  const rows = await input.store.due("suspended", Math.min(100, input.cap + 1), input.nowIso);
  const actionable = rows.slice(0, input.cap);
  if (rows.length > input.cap) input.markCapped();

  for (const row of actionable) {
    input.target.due += 1;
    if (!stageHonorsRules(row, input.now)) {
      await recordRuleFailure(input.store, row, live, input.target);
      continue;
    }
    if (!live) continue;

    if (!row.already_suspended) {
      await input.store.suspendUser(row.user_id, input.nowIso);
      input.target.acted += 1;
    }

    if (row.email_suppressed) {
      const id = await input.store.claim(row);
      if (id) {
        await input.store.markSkipped(id, "suppressed");
        input.target.skipped += 1;
      }
      continue;
    }

    if (input.emailRemaining() <= 0) {
      input.markCapped();
      continue;
    }

    const before = input.target.sent;
    await sendRow({
      store: input.store,
      mailer: input.mailer,
      row,
      nowIso: input.nowIso,
      stage: input.target,
    });
    if (input.target.sent > before) input.consumeEmail();
  }
}

async function processDeleteStage(input: {
  mode: InactivityMode;
  cap: number;
  now: Date;
  nowIso: string;
  store: InactivityStore;
  target: InactivityStageResult;
  markCapped: () => void;
}) {
  const live = input.mode === "live";
  const already = live
    ? await input.store.sentCount(phoenixWeekStart(input.now).toISOString(), ["deleted"])
    : 0;
  const room = input.cap - already;
  if (room <= 0) {
    input.markCapped();
    return;
  }

  const rows = await input.store.due("deleted", Math.min(100, room + 1), input.nowIso);
  const actionable = rows.slice(0, room);
  if (rows.length > room) input.markCapped();

  for (const row of actionable) {
    input.target.due += 1;
    if (!stageHonorsRules(row, input.now)) {
      await recordRuleFailure(input.store, row, live, input.target);
      continue;
    }
    if (!live) continue;

    const id = await input.store.claim(row);
    if (!id) continue;
    try {
      await input.store.deleteUser(row.user_id);
      await input.store.markSent(id, null, input.nowIso);
      input.target.acted += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Deletion failed";
      await input.store.markFailed(id, redactInactivityError(message));
      input.target.failed += 1;
    }
  }
}
