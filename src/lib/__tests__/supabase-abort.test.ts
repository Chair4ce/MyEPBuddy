import { describe, expect, it, vi } from "vitest";
import { isAbortError, logUnlessAborted } from "@/lib/supabase/abort";

describe("isAbortError", () => {
  it("detects AbortError-shaped PostgREST failures", () => {
    expect(
      isAbortError({
        message: "AbortError: signal is aborted without reason",
        hint: "Request was aborted (timeout or manual cancellation)",
        code: "",
      }),
    ).toBe(true);
  });

  it("ignores normal query errors", () => {
    expect(
      isAbortError({ message: "relation does not exist", code: "42P01" }),
    ).toBe(false);
  });
});

describe("logUnlessAborted", () => {
  it("does not console.error on abort", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(
      logUnlessAborted(
        { message: "AbortError: signal is aborted without reason" },
        "Error loading award shells:",
      ),
    ).toBe(true);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

