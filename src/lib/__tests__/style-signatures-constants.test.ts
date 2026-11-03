import { describe, it, expect } from "vitest";
import {
  STYLE_SIGNATURE_DAILY_APP_LIMIT,
  STYLE_SIGNATURE_MODEL,
} from "../style-signatures/constants";

describe("style signature constants", () => {
  it("uses a fast OpenAI model for fingerprint analysis", () => {
    expect(STYLE_SIGNATURE_MODEL).toBe("gpt-4o-mini");
  });

  it("keeps the legacy app-key daily cap that style signatures no longer call", () => {
    expect(STYLE_SIGNATURE_DAILY_APP_LIMIT).toBeGreaterThan(0);
    expect(STYLE_SIGNATURE_DAILY_APP_LIMIT).toBeLessThanOrEqual(24);
  });
});
