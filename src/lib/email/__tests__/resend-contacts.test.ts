import { afterEach, describe, expect, it, vi } from "vitest";
import { ResendSendError } from "../resend";
import { isMilEmail, syncResendMarketingContact } from "../resend-contacts";

describe("isMilEmail", () => {
  it("detects .mil regardless of case", () => {
    expect(isMilEmail("user@us.af.mil")).toBe(true);
    expect(isMilEmail("USER@US.AF.MIL")).toBe(true);
    expect(isMilEmail("user@gmail.com")).toBe(false);
  });
});

describe("syncResendMarketingContact", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("skips when API key is missing", async () => {
    const result = await syncResendMarketingContact({
      email: "a@gmail.com",
      optedIn: false,
      resendApiKey: null,
    });
    expect(result).toEqual({ status: "skipped", reason: "no_key" });
  });

  it("skips .mil addresses", async () => {
    const result = await syncResendMarketingContact({
      email: "a@us.af.mil",
      optedIn: true,
      resendApiKey: "re_test",
    });
    expect(result).toEqual({ status: "skipped", reason: "mil" });
  });

  it("PATCHes unsubscribed true on opt-out", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "{}",
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await syncResendMarketingContact({
      email: "Airman@Gmail.com",
      optedIn: false,
      resendApiKey: "re_test",
    });

    expect(result).toEqual({ status: "synced" });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/contacts/airman%40gmail.com");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(String(init.body))).toEqual({ unsubscribed: true });
  });

  it("creates the contact when PATCH returns 404", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => "missing",
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => "{}",
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await syncResendMarketingContact({
      email: "new@gmail.com",
      optedIn: true,
      resendApiKey: "re_test",
    });

    expect(result).toEqual({ status: "synced" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const createInit = fetchMock.mock.calls[1][1] as RequestInit;
    expect(createInit.method).toBe("POST");
    expect(JSON.parse(String(createInit.body))).toEqual({
      email: "new@gmail.com",
      unsubscribed: false,
    });
  });

  it("throws when Resend rejects the update", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => "forbidden",
    }));

    await expect(
      syncResendMarketingContact({
        email: "a@gmail.com",
        optedIn: false,
        resendApiKey: "re_test",
      })
    ).rejects.toBeInstanceOf(ResendSendError);
  });
});
