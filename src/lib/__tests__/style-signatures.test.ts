import { APICallError } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateStyleSignature, refreshUserSignatures } from "../style-signatures";

const ENV_OPENAI_KEY = "sk-env-openai-not-for-style-signatures";
const USER_OPENAI_KEY = "sk-user-openai-for-style-signatures";
const LEAKED_KEY = "sk-live-openai-key-should-never-be-logged-1234567890";

const createOpenAIMock = vi.hoisted(() =>
  vi.fn((_options: { apiKey: string }) => () => ({ modelId: "gpt-4o-mini" })),
);
const generateTextMock = vi.hoisted(() => vi.fn());
const insertUsage = vi.hoisted(() => vi.fn(async () => ({ error: null })));
const createClientMock = vi.hoisted(() => vi.fn());
const rpcMock = vi.hoisted(() => vi.fn());
const getDecryptedApiKeys = vi.hoisted(() => vi.fn());

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: createOpenAIMock,
}));

vi.mock("@/lib/ai-models/token-usage", () => ({
  wrapModelWithUsageTracking: (model: unknown) => model,
}));

vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  return {
    ...actual,
    generateText: (...args: unknown[]) => generateTextMock(...args),
  };
});

vi.mock("@/app/actions/api-keys", () => ({
  getDecryptedApiKeys: () => getDecryptedApiKeys(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => createClientMock(),
  createAdminClient: () => ({
    from: () => ({ insert: insertUsage }),
  }),
}));

const STATEMENTS = [
  { id: "1", statement: "Led the flight and closed the gap." },
  { id: "2", statement: "Built the tracker and cut delays." },
  { id: "3", statement: "Saved hours across the unit." },
];

function query(table: string) {
  const rows =
    table === "refined_statements"
      ? STATEMENTS
      : table === "epb_shells"
        ? [{ id: "shell-1", user_id: "user-1", team_member_id: null }]
        : [];
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  for (const name of ["select", "eq", "not", "order", "limit", "in"]) {
    builder[name] = chain;
  }
  builder.maybeSingle = async () => {
    if (table === "profiles") {
      return {
        data: { id: "user-1", rank: "SSgt", afsc: "3D1X2" },
        error: null,
      };
    }
    return { data: null, error: null };
  };
  builder.upsert = async () => ({ error: null });
  builder.then = (
    resolve: (value: unknown) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => Promise.resolve({ data: rows, error: null }).then(resolve, reject);
  return builder;
}

function openAiCreditError(): APICallError {
  return new APICallError({
    message: `You have no credits remaining ${LEAKED_KEY}`,
    url: "https://api.openai.com/v1/chat/completions",
    requestBodyValues: { apiKey: LEAKED_KEY },
    statusCode: 429,
    responseBody: JSON.stringify({
      error: {
        message: `You have no credits remaining. ${LEAKED_KEY}`,
        code: "insufficient_quota",
      },
    }),
    isRetryable: false,
  });
}

describe("style signatures", () => {
  const originalEnvKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENAI_API_KEY = ENV_OPENAI_KEY;
    insertUsage.mockResolvedValue({ error: null });
    createClientMock.mockResolvedValue({
      from: (table: string) => query(table),
      rpc: rpcMock,
    });
    generateTextMock.mockResolvedValue({
      text: "This author's style is characterized by short clauses.",
    });
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    if (originalEnvKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalEnvKey;
    }
    vi.restoreAllMocks();
  });

  it("skips when no user OpenAI key is loaded", async () => {
    getDecryptedApiKeys.mockResolvedValue({
      openai_key: "   ",
      google_key: "user-gemini-key",
    });

    const refreshed = await refreshUserSignatures("user-1");
    const generated = await generateStyleSignature(
      "user-1",
      "SSgt",
      "3D1X2",
      "general",
      { openai_key: null, google_key: "user-gemini-key" },
    );

    expect(refreshed).toEqual({ generated: 0, quotaExhausted: false });
    expect(generated).toBe("skipped");
    expect(createClientMock).not.toHaveBeenCalled();
    expect(createOpenAIMock).not.toHaveBeenCalled();
    expect(generateTextMock).not.toHaveBeenCalled();
    expect(insertUsage).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
    expect(console.info).toHaveBeenCalledWith(
      "[style-signatures] Skipping refresh: no user OpenAI key loaded",
    );
    expect(console.info).toHaveBeenCalledWith(
      "[style-signatures] Skipping signature: no user OpenAI key loaded",
    );
  });

  it("uses the loaded user OpenAI key and records it as a user key", async () => {
    const result = await generateStyleSignature(
      "user-1",
      "SSgt",
      "3D1X2",
      "general",
      { openai_key: `  ${USER_OPENAI_KEY}  ` },
    );

    expect(result).toBe("generated");
    expect(createOpenAIMock).toHaveBeenCalledTimes(1);
    expect(createOpenAIMock).toHaveBeenCalledWith({ apiKey: USER_OPENAI_KEY });
    expect(createOpenAIMock.mock.calls.flat()).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ apiKey: ENV_OPENAI_KEY })]),
    );
    expect(generateTextMock).toHaveBeenCalledTimes(1);
    expect(insertUsage).toHaveBeenCalledWith({
      user_id: "user-1",
      action_type: "style_signature_llm",
      used_default_key: false,
      model_id: "gpt-4o-mini",
      provider: "openai",
    });
    expect(rpcMock).not.toHaveBeenCalled();
    const logged = JSON.stringify([
      insertUsage.mock.calls,
      vi.mocked(console.info).mock.calls,
      vi.mocked(console.error).mock.calls,
    ]);
    expect(logged).not.toContain(USER_OPENAI_KEY);
    expect(logged).not.toContain(ENV_OPENAI_KEY);
  });

  it("does not fall back to OPENAI_API_KEY when the user key is missing", async () => {
    const result = await generateStyleSignature(
      "user-1",
      "SSgt",
      "3D1X2",
      "executing_mission",
      null,
    );

    expect(result).toBe("skipped");
    expect(process.env.OPENAI_API_KEY).toBe(ENV_OPENAI_KEY);
    expect(createOpenAIMock).not.toHaveBeenCalled();
    expect(generateTextMock).not.toHaveBeenCalled();
    expect(insertUsage).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalledWith(
      "try_record_style_signature_app_call",
      expect.anything(),
    );
    const logged = JSON.stringify(vi.mocked(console.info).mock.calls);
    expect(logged).not.toContain(ENV_OPENAI_KEY);
  });

  it("logs provider credit errors with provider, model, and key source", async () => {
    generateTextMock.mockRejectedValue(openAiCreditError());

    const result = await generateStyleSignature(
      "user-1",
      "SSgt",
      "3D1X2",
      "general",
      { openai_key: USER_OPENAI_KEY },
    );

    expect(result).toBe("provider_credit");
    expect(console.error).toHaveBeenCalledWith(
      "[style-signatures] provider call failed",
      {
        provider: "OpenAI",
        model: "gpt-4o-mini",
        keySource: "user",
        errorCode: "insufficient_funds",
      },
    );
    const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logged).not.toContain(LEAKED_KEY);
    expect(logged).not.toContain(USER_OPENAI_KEY);
    expect(logged).not.toContain("sk-");
  });

  it("stops the refresh after one credit failure instead of calling every area", async () => {
    getDecryptedApiKeys.mockResolvedValue({ openai_key: USER_OPENAI_KEY });
    generateTextMock.mockRejectedValue(openAiCreditError());

    const refreshed = await refreshUserSignatures("user-1");

    expect(refreshed).toEqual({ generated: 0, quotaExhausted: false });
    expect(generateTextMock).toHaveBeenCalledTimes(1);
    expect(insertUsage).toHaveBeenCalledTimes(1);
    expect(insertUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        used_default_key: false,
        model_id: "gpt-4o-mini",
        provider: "openai",
      }),
    );
    expect(createOpenAIMock).toHaveBeenCalledWith({ apiKey: USER_OPENAI_KEY });
    expect(createOpenAIMock).not.toHaveBeenCalledWith({ apiKey: ENV_OPENAI_KEY });
  });
});
