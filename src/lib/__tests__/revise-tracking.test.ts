import { describe, expect, it } from "vitest";
import { reviseTrackingAction, withTrackingAction } from "../revise-tracking";

describe("reviseTrackingAction", () => {
  it("maps expand / compress / rephrase without changing credit action names", () => {
    expect(reviseTrackingAction("expand")).toBe("revise_expand");
    expect(reviseTrackingAction("compress")).toBe("revise_compress");
    expect(reviseTrackingAction("general")).toBe("revise_rephrase");
    expect(reviseTrackingAction(undefined)).toBe("revise_rephrase");
  });
});

describe("withTrackingAction", () => {
  it("overrides the telemetry action while keeping the rest of the context", () => {
    const next = withTrackingAction(
      { subjectId: "user-1", action: "revise_selection", usingDefaultKey: true },
      "revise_expand",
    );
    expect(next).toEqual({
      subjectId: "user-1",
      action: "revise_expand",
      usingDefaultKey: true,
    });
  });

  it("passes through missing tracking", () => {
    expect(withTrackingAction(undefined, "revise_expand")).toBeUndefined();
  });
});
