import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/email/resend", () => ({
  getResendWebhookSecret: vi.fn(),
}));

vi.mock("@/lib/email/resend-webhook", () => ({
  verifyResendWebhookSignature: vi.fn(),
  parseResendWebhookEvent: vi.fn(),
  interpretResendWebhookEvent: vi.fn(),
  applyResendListAction: vi.fn(),
}));

import { GET, POST } from "../route";
import { getResendWebhookSecret } from "@/lib/email/resend";
import {
  applyResendListAction,
  interpretResendWebhookEvent,
  parseResendWebhookEvent,
  verifyResendWebhookSignature,
} from "@/lib/email/resend-webhook";

function postRequest(init?: {
  headers?: Record<string, string>;
  body?: string;
}): Request {
  return new Request("https://www.myepbuddy.com/api/webhooks/resend", {
    method: "POST",
    headers: init?.headers,
    body: init?.body ?? '{"type":"contact.updated"}',
  });
}

describe("GET /api/webhooks/resend", () => {
  it("returns a 200 health payload", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      endpoint: "resend",
      url: "https://www.myepbuddy.com/api/webhooks/resend",
    });
  });
});

describe("POST /api/webhooks/resend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getResendWebhookSecret).mockReturnValue("whsec_test");
  });

  it("acks after a valid event even when contact sync is marked failed", async () => {
    vi.mocked(parseResendWebhookEvent).mockReturnValue({
      type: "email.bounced",
    });
    vi.mocked(interpretResendWebhookEvent).mockReturnValue({
      kind: "preference",
      email: "gone@gmail.com",
      optedIn: false,
      syncContact: true,
    });
    vi.mocked(applyResendListAction).mockResolvedValue({
      status: "updated",
      contactSync: "failed",
    });

    const response = await POST(
      postRequest({
        headers: {
          "svix-id": "msg_1",
          "svix-timestamp": "1",
          "svix-signature": "v1,abc",
        },
      }) as never
    );

    expect(verifyResendWebhookSignature).toHaveBeenCalled();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      received: true,
      status: "updated",
      contactSync: "failed",
    });
  });
});
