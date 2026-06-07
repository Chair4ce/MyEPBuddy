import { describe, it, expect } from "vitest";
import { DEFAULT_SIGNUP_TRIAL_CREDITS } from "../billing/constants";

describe("signup trial credits defaults", () => {
  it("defaults to 20 free calls", () => {
    expect(DEFAULT_SIGNUP_TRIAL_CREDITS).toBe(20);
  });
});
