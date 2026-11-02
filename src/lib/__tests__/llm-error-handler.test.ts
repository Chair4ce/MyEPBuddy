import { APICallError } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleBillableLLMError } from "../billing/billable-request";
import { handleLLMError } from "../llm-error-handler";
import { messageFromUnknownError } from "../llm-user-message";
import type { UsageCheckResult } from "../usage-tracker";

vi.mock("@/lib/billing/refund-credit", () => ({
  refundBillableCreditIfNeeded: vi.fn(async () => null),
}));

const LEAKED_KEY = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz123456";

function anthropicCreditError(): APICallError {
  return new APICallError({
    message: "Your credit balance is too low",
    url: "https://api.anthropic.com/v1/messages",
    requestBodyValues: { apiKey: LEAKED_KEY },
    statusCode: 400,
    responseBody: JSON.stringify({
      type: "error",
      error: {
        type: "invalid_request_error",
        message: `Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits. ${LEAKED_KEY}`,
      },
    }),
    isRetryable: false,
  });
}

describe("handleLLMError", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("maps Anthropic 400 credit balance to the caller's own key and model", async () => {
    const response = handleLLMError(
      anthropicCreditError(),
      "POST /api/revise-selection",
      "claude-sonnet-4-6",
      { usingDefaultKey: false },
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual({
      error:
        "Your Anthropic API key is out of credit (Claude Sonnet 4.6, your own key). Add credit at console.anthropic.com or switch to another model.",
      errorCode: "insufficient_funds",
      provider: "Anthropic",
      model: "Claude Sonnet 4.6",
      modelId: "claude-sonnet-4-6",
      keySource: "user",
    });
    expect(JSON.stringify(body)).not.toContain(LEAKED_KEY);
    expect(JSON.stringify(body)).not.toContain("sk-");
  });

  it("attributes an empty balance on the app default key to the app, not the user", async () => {
    const response = handleLLMError(
      anthropicCreditError(),
      "POST /api/generate",
      "gemini-2.5-flash-lite",
      { usingDefaultKey: true },
    );

    const body = await response.json();
    expect(body.error).toBe(
      "The app default Google AI key is out of credit (Gemini 2.5 Flash Lite, the app default key). Try again later or add your own key in Settings → API Keys.",
    );
    expect(body.errorCode).toBe("insufficient_funds");
    expect(body.keySource).toBe("app");
    expect(body.modelId).toBe("gemini-2.5-flash-lite");
    expect(body.provider).toBe("Google AI");
  });

  it("maps a generic credit-balance Error when the SDK does not attach a status", async () => {
    const response = handleLLMError(
      new Error("Your credit balance is too low to access the Anthropic API"),
      "POST /api/revise-selection",
      "claude-sonnet-4-6",
      { usingDefaultKey: false },
    );

    expect(response.status).toBe(402);
    const body = await response.json();
    expect(body.errorCode).toBe("insufficient_funds");
    expect(body.error).toContain("your own key");
    expect(body.error).toContain("Claude Sonnet 4.6");
    expect(body.model).toBe("Claude Sonnet 4.6");
  });

  it("keeps quota and rate-limit responses distinct and still names the model", async () => {
    const quota = handleLLMError(
      new APICallError({
        message: "quota",
        url: "https://api.openai.com/v1/chat/completions",
        requestBodyValues: {},
        statusCode: 429,
        responseBody: JSON.stringify({
          error: { message: "You exceeded your current quota, please check your plan and billing details." },
        }),
        isRetryable: true,
      }),
      "POST /api/generate",
      "gpt-4o",
      { usingDefaultKey: false },
    );
    const quotaBody = await quota.json();
    expect(quota.status).toBe(429);
    expect(quotaBody.errorCode).toBe("quota_exceeded");
    expect(quotaBody.keySource).toBe("user");
    expect(quotaBody.model).toBe("GPT-4o");
    expect(quotaBody.error).toContain("(GPT-4o, your own key)");
    expect(quotaBody.error).toContain("usage quota");

    const rateLimit = handleLLMError(
      new APICallError({
        message: "rate limit",
        url: "https://api.anthropic.com/v1/messages",
        requestBodyValues: {},
        statusCode: 429,
        responseBody: JSON.stringify({
          error: { message: "Rate limit reached for requests" },
        }),
        isRetryable: true,
      }),
      "POST /api/revise-selection",
      "claude-sonnet-4-6",
      { usingDefaultKey: false },
    );
    const rateBody = await rateLimit.json();
    expect(rateBody.errorCode).toBe("rate_limit_exceeded");
    expect(rateBody.error).toContain("rate limit");
    expect(rateBody.error).toContain("(Claude Sonnet 4.6, your own key)");
  });

  it("strips key material from a generic provider rejection", async () => {
    const response = handleLLMError(
      new APICallError({
        message: "bad request",
        url: "https://api.openai.com/v1/chat/completions",
        requestBodyValues: {},
        statusCode: 400,
        responseBody: JSON.stringify({
          error: { message: `Invalid parameter ${LEAKED_KEY}` },
        }),
        isRetryable: false,
      }),
      "POST /api/generate",
      "gpt-4o",
      { usingDefaultKey: false },
    );

    const body = await response.json();
    expect(body.errorCode).toBe("invalid_request");
    expect(body.error).toContain("[API_KEY]");
    expect(JSON.stringify(body)).not.toContain(LEAKED_KEY);
    expect(body.modelId).toBe("gpt-4o");
    expect(body.keySource).toBe("user");
  });

  it("omits key source when the route does not know which credential ran", async () => {
    const response = handleLLMError(
      new Error("socket hang up"),
      "POST /api/generate",
      "claude-sonnet-4-6",
    );
    const body = await response.json();
    expect(body.keySource).toBeUndefined();
    expect(body.error).not.toContain("your own key");
    expect(body.error).not.toContain("app default key");
    expect(body.model).toBe("Claude Sonnet 4.6");
  });
});

describe("handleBillableLLMError", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("reports the effective model and whether the default key was used", async () => {
    const usageCheck: UsageCheckResult = {
      allowed: true,
      usingDefaultKey: true,
      effectiveModel: "gemini-2.5-flash-lite",
    };

    const response = await handleBillableLLMError(
      anthropicCreditError(),
      "POST /api/revise-selection",
      "claude-sonnet-4-6",
      {
        userId: "user-1",
        idempotencyKey: "idem-1",
        usageCheck,
      },
    );

    const body = await response.json();
    expect(body.modelId).toBe("gemini-2.5-flash-lite");
    expect(body.model).toBe("Gemini 2.5 Flash Lite");
    expect(body.keySource).toBe("app");
    expect(body.provider).toBe("Google AI");
    expect(body.error).toContain("the app default key");
    expect(JSON.stringify(body)).not.toContain(LEAKED_KEY);
  });
});

describe("messageFromUnknownError", () => {
  it("uses the thrown server message", () => {
    expect(
      messageFromUnknownError(
        new Error("Your Anthropic API key is out of credit (Claude Sonnet 4.6, your own key)."),
        "Failed to generate revisions",
      ),
    ).toContain("out of credit");
  });

  it("falls back only when the error has no message", () => {
    expect(messageFromUnknownError(new Error("   "), "Failed to generate revisions")).toBe(
      "Failed to generate revisions",
    );
    expect(messageFromUnknownError(undefined, "Failed to assess accomplishment")).toBe(
      "Failed to assess accomplishment",
    );
  });
});
