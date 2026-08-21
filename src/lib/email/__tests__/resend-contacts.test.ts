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
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("skips when API key is missing", async () => {
    const result = await syncResendMarketingContact({
      email: "a@gmail.com",
      optedIn: false,
      resendContactsApiKey: null,
    });
    expect(result).toEqual({ status: "skipped", reason: "no_key" });
  });

  it("skips .mil addresses", async () => {
    const result = await syncResendMarketingContact({
      email: "a@us.af.mil",
      optedIn: true,
      resendContactsApiKey: "re_contacts_test",
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
      resendContactsApiKey: "re_contacts_test",
    });

    expect(result).toEqual({ status: "synced" });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/contacts/airman%40gmail.com");
    expect(init.method).toBe("PATCH");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer re_contacts_test"
    );
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
      resendContactsApiKey: "re_contacts_test",
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
        resendContactsApiKey: "re_contacts_test",
      })
    ).rejects.toBeInstanceOf(ResendSendError);
  });

  it("uses RESEND_CONTACTS_API_KEY instead of the sending key", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_sending_only");
    vi.stubEnv("RESEND_CONTACTS_API_KEY", "re_full_contacts");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "{}",
    });
    vi.stubGlobal("fetch", fetchMock);

    await syncResendMarketingContact({
      email: "a@gmail.com",
      optedIn: false,
    });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer re_full_contacts"
    );
  });

  it("throws in production when the contacts key is missing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "re_sending_only");
    vi.stubEnv("RESEND_CONTACTS_API_KEY", "");

    await expect(
      syncResendMarketingContact({
        email: "a@gmail.com",
        optedIn: false,
      })
    ).rejects.toBeInstanceOf(ResendSendError);
  });
});
