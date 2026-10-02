import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyResendListAction,
  interpretResendWebhookEvent,
  parseResendWebhookEvent,
  verifyResendWebhookSignature,
} from "../resend-webhook";

function sign(params: {
  payload: string;
  id: string;
  timestamp: string;
  secret: string;
}): string {
  const secretB64 = params.secret.startsWith("whsec_")
    ? params.secret.slice(6)
    : params.secret;
  const key = Buffer.from(secretB64, "base64");
  const digest = createHmac("sha256", key)
    .update(`${params.id}.${params.timestamp}.${params.payload}`)
    .digest("base64");
  return `v1,${digest}`;
}

describe("verifyResendWebhookSignature", () => {
  const secret = `whsec_${Buffer.from("test-secret").toString("base64")}`;
  const payload = '{"type":"contact.updated"}';
  const id = "msg_test";

  it("accepts a valid Svix signature", () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    expect(() =>
      verifyResendWebhookSignature({
        payload,
        id,
        timestamp,
        signatureHeader: sign({ payload, id, timestamp, secret }),
        secret,
      })
    ).not.toThrow();
  });

  it("rejects a tampered payload", () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signatureHeader = sign({ payload, id, timestamp, secret });
    expect(() =>
      verifyResendWebhookSignature({
        payload: '{"type":"forged"}',
        id,
        timestamp,
        signatureHeader,
        secret,
      })
    ).toThrow(/Invalid webhook signature/);
  });

  it("rejects a stale timestamp", () => {
    const timestamp = String(Math.floor(Date.now() / 1000) - 60 * 60);
    expect(() =>
      verifyResendWebhookSignature({
        payload,
        id,
        timestamp,
        signatureHeader: sign({ payload, id, timestamp, secret }),
        secret,
      })
    ).toThrow(/too old/);
  });
});

describe("interpretResendWebhookEvent", () => {
  it("maps contact.updated unsubscribed to opt-out without re-PATCHing Resend", () => {
    expect(
      interpretResendWebhookEvent({
        type: "contact.updated",
        data: { email: "Airman@Gmail.com", unsubscribed: true },
      })
    ).toEqual({
      kind: "preference",
      email: "airman@gmail.com",
      optedIn: false,
      syncContact: false,
    });
  });

  it("maps a hard bounce to opt-out and contact sync", () => {
    expect(
      interpretResendWebhookEvent({
        type: "email.bounced",
        data: {
          to: ["gone@gmail.com"],
          bounce: { type: "Permanent" },
        },
      })
    ).toEqual({
      kind: "preference",
      email: "gone@gmail.com",
      optedIn: false,
      syncContact: true,
    });
  });

  it("ignores soft bounces", () => {
    expect(
      interpretResendWebhookEvent({
        type: "email.bounced",
        data: {
          to: ["temp@gmail.com"],
          bounce: { type: "Temporary" },
        },
      })
    ).toEqual({ kind: "ignore", reason: "soft_bounce" });
  });

  it("maps spam complaints to opt-out", () => {
    expect(
      interpretResendWebhookEvent({
        type: "email.complained",
        data: { to: ["spam@gmail.com"] },
      })
    ).toEqual({
      kind: "preference",
      email: "spam@gmail.com",
      optedIn: false,
      syncContact: true,
    });
  });

  it("skips .mil recipients", () => {
    expect(
      interpretResendWebhookEvent({
        type: "contact.updated",
        data: { email: "a@us.af.mil", unsubscribed: true },
      })
    ).toEqual({ kind: "ignore", reason: "mil" });
  });
});

describe("applyResendListAction", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("no-ops when the stored preference already matches", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { id: "user-1", marketing_email_opt_in: false },
      error: null,
    });
    const filter = vi.fn().mockReturnValue({ maybeSingle });
    const admin = {
      from: () => ({
        select: () => ({
          filter,
        }),
        update: () => ({ eq: vi.fn() }),
      }),
    };

    const result = await applyResendListAction(
      {
        kind: "preference",
        email: "A@Gmail.com",
        optedIn: false,
        syncContact: false,
      },
      { admin: admin as never }
    );

    expect(filter).toHaveBeenCalledWith("email_lower", "eq", "a@gmail.com");
    expect(result).toEqual({ status: "unchanged", contactSync: "skipped" });
  });

  it("updates the profile when Resend unsubscribes a previously opted-in user", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { id: "user-1", marketing_email_opt_in: true },
      error: null,
    });
    const filter = vi.fn().mockReturnValue({ maybeSingle });
    const admin = {
      from: () => ({
        select: () => ({
          filter,
        }),
        update,
      }),
    };

    const result = await applyResendListAction(
      {
        kind: "preference",
        email: "a@gmail.com",
        optedIn: false,
        syncContact: false,
      },
      { admin: admin as never }
    );

    expect(filter).toHaveBeenCalledWith("email_lower", "eq", "a@gmail.com");
    expect(result).toEqual({ status: "updated", contactSync: "skipped" });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        marketing_email_opt_in: false,
        marketing_email_opt_in_source: "resend",
      })
    );
  });

  it("updates the profile even when bounce contact sync throws", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { id: "user-1", marketing_email_opt_in: true },
      error: null,
    });
    const filter = vi.fn().mockReturnValue({ maybeSingle });
    const admin = {
      from: () => ({
        select: () => ({
          filter,
        }),
        update,
      }),
    };
    const syncContact = vi.fn().mockRejectedValue(new Error("restricted_api_key"));

    const result = await applyResendListAction(
      {
        kind: "preference",
        email: "gone@gmail.com",
        optedIn: false,
        syncContact: true,
      },
      { admin: admin as never, syncContact }
    );

    expect(filter).toHaveBeenCalledWith("email_lower", "eq", "gone@gmail.com");
    expect(result).toEqual({ status: "updated", contactSync: "failed" });
    expect(update).toHaveBeenCalled();
    expect(syncContact).toHaveBeenCalledWith({
      email: "gone@gmail.com",
      optedIn: false,
    });
  });

  it("records successful bounce contact sync after the profile write", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { id: "user-1", marketing_email_opt_in: false },
      error: null,
    });
    const filter = vi.fn().mockReturnValue({ maybeSingle });
    const admin = {
      from: () => ({
        select: () => ({
          filter,
        }),
        update: () => ({ eq: vi.fn() }),
      }),
    };
    const syncContact = vi.fn().mockResolvedValue({ status: "synced" });

    const result = await applyResendListAction(
      {
        kind: "preference",
        email: "gone@gmail.com",
        optedIn: false,
        syncContact: true,
      },
      { admin: admin as never, syncContact }
    );

    expect(filter).toHaveBeenCalledWith("email_lower", "eq", "gone@gmail.com");
    expect(result).toEqual({ status: "unchanged", contactSync: "ok" });
    expect(syncContact).toHaveBeenCalledOnce();
  });
  it("falls back to the exact ilike lookup when the email_lower query errors", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    const filter = vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "42703", message: "column profiles.email_lower does not exist" },
      }),
    });
    const ilike = vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: "user-1", marketing_email_opt_in: true },
        error: null,
      }),
    });
    const admin = {
      from: () => ({
        select: () => ({ filter, ilike }),
        update,
      }),
    };

    const result = await applyResendListAction(
      {
        kind: "preference",
        email: "A_B%x@Gmail.com",
        optedIn: false,
        syncContact: false,
      },
      { admin: admin as never }
    );

    expect(filter).toHaveBeenCalledWith("email_lower", "eq", "a_b%x@gmail.com");
    expect(ilike).toHaveBeenCalledWith("email", "a\\_b\\%x@gmail.com");
    expect(result).toEqual({ status: "updated", contactSync: "skipped" });
    expect(eq).toHaveBeenCalledWith("id", "user-1");
  });

  it("throws when both the email_lower and ilike lookups error", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fallbackError = { code: "PGRST000", message: "db down" };
    const update = vi.fn();
    const admin = {
      from: () => ({
        select: () => ({
          filter: () => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: null,
              error: { code: "42703", message: "missing" },
            }),
          }),
          ilike: () => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: fallbackError }),
          }),
        }),
        update,
      }),
    };

    await expect(
      applyResendListAction(
        {
          kind: "preference",
          email: "a@gmail.com",
          optedIn: false,
          syncContact: false,
        },
        { admin: admin as never }
      )
    ).rejects.toBe(fallbackError);
    expect(update).not.toHaveBeenCalled();
  });

  it("ignores the event when no profile matches", async () => {
    const update = vi.fn();
    const ilike = vi.fn();
    const admin = {
      from: () => ({
        select: () => ({
          filter: () => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
          ilike,
        }),
        update,
      }),
    };

    const result = await applyResendListAction(
      {
        kind: "preference",
        email: "nobody@gmail.com",
        optedIn: false,
        syncContact: false,
      },
      { admin: admin as never }
    );

    expect(result).toEqual({ status: "ignored", contactSync: "skipped" });
    expect(ilike).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});

describe("parseResendWebhookEvent", () => {
  it("requires a type", () => {
    expect(() => parseResendWebhookEvent("{}")).toThrow(/Invalid webhook payload/);
  });
});
