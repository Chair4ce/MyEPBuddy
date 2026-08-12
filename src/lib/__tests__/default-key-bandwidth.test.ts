import { describe, expect, it } from "vitest";
import {
  defaultKeyFairCap,
  isDefaultKeyFairShareDenied,
} from "../default-key-bandwidth";

describe("defaultKeyFairCap", () => {
  it("gives the full pool to a single active user", () => {
    expect(defaultKeyFairCap(60, 1)).toBe(60);
  });

  it("splits the pool evenly across concurrent users", () => {
    expect(defaultKeyFairCap(60, 10)).toBe(6);
    expect(defaultKeyFairCap(60, 7)).toBe(9);
  });
});

describe("isDefaultKeyFairShareDenied", () => {
  it("never denies when the caller is alone", () => {
    expect(
      isDefaultKeyFairShareDenied({
        capacityRpm: 60,
        otherActiveUsers: 0,
        userRecentInWindow: 59,
      }),
    ).toBe(false);
  });

  it("denies when a contended user already used their fair share", () => {
    expect(
      isDefaultKeyFairShareDenied({
        capacityRpm: 60,
        otherActiveUsers: 9,
        userRecentInWindow: 6,
      }),
    ).toBe(true);
  });

  it("allows under fair share while others are active", () => {
    expect(
      isDefaultKeyFairShareDenied({
        capacityRpm: 60,
        otherActiveUsers: 9,
        userRecentInWindow: 5,
      }),
    ).toBe(false);
  });
});
