import { afterEach, describe, expect, it, vi } from "vitest";
import { sendResendEmail } from "../resend";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sendResendEmail", () => {
  it("returns the Resend id and sends the idempotency key and tags", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "email_123" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendResendEmail({
      resendApiKey: "re_test",
      from: "MyEPBuddy <updates@updates.myepbuddy.com>",
      to: "person@example.com",
      subject: "Subject",
      html: "<p>Hi</p>",
      text: "Hi",
      idempotencyKey: "inactivity/user/notice_60/1735689600",
      tags: [
        { name: "category", value: "inactivity" },
        { name: "notice", value: "60" },
      ],
    });

    expect(result).toEqual({ id: "email_123" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(new Headers(init.headers).get("Idempotency-Key")).toBe(
      "inactivity/user/notice_60/1735689600"
    );
    expect(JSON.parse(String(init.body))).toMatchObject({
      tags: [
        { name: "category", value: "inactivity" },
        { name: "notice", value: "60" },
      ],
    });
  });

  it("rejects an idempotency key that could not be stored safely", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      sendResendEmail({
        resendApiKey: "re_test",
        from: "MyEPBuddy <updates@updates.myepbuddy.com>",
        to: "person@example.com",
        subject: "Subject",
        html: "<p>Hi</p>",
        text: "Hi",
        idempotencyKey: "has whitespace",
      })
    ).rejects.toThrow("Invalid Resend idempotency key");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
