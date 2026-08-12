import { describe, expect, it, vi } from "vitest";
import {
  BILLABLE_BURST_BUFFER_MS,
  BILLABLE_BURST_WINDOW_MS,
  BYOK_BURST_LIMIT,
  DEFAULT_KEY_CLIENT_BURST_LIMIT,
  msUntilBurstSlot,
  recordBurstAction,
  waitForBurstSlot,
} from "@/lib/burst-pacing";

describe("msUntilBurstSlot", () => {
  it("returns 0 when under the burst limit", () => {
    const now = 100_000;
    expect(msUntilBurstSlot([now - 1000], now)).toBe(0);
  });

  it("waits until the oldest action in the full window expires", () => {
    const now = 100_000;
    const stamps = Array.from(
      { length: DEFAULT_KEY_CLIENT_BURST_LIMIT },
      (_, i) => now - (i + 1) * 1000,
    );
    expect(msUntilBurstSlot(stamps, now)).toBe(
      BILLABLE_BURST_WINDOW_MS - DEFAULT_KEY_CLIENT_BURST_LIMIT * 1000,
    );
  });

  it("supports the stricter BYOK limit", () => {
    const now = 100_000;
    const stamps = Array.from(
      { length: BYOK_BURST_LIMIT },
      (_, i) => now - (i + 1) * 1000,
    );
    expect(msUntilBurstSlot(stamps, now, BYOK_BURST_LIMIT)).toBe(
      BILLABLE_BURST_WINDOW_MS - BYOK_BURST_LIMIT * 1000,
    );
  });
});

describe("recordBurstAction", () => {
  it("drops timestamps outside the window and appends the new one", () => {
    const now = 200_000;
    const next = recordBurstAction(
      [now - BILLABLE_BURST_WINDOW_MS - 1, now - 1000],
      now,
    );
    expect(next).toEqual([now - 1000, now]);
  });
});

describe("waitForBurstSlot", () => {
  it("sleeps only when the window is full", async () => {
    const sleep = vi.fn(async (_ms: number) => {});
    const now = 100_000;
    const full = Array.from(
      { length: DEFAULT_KEY_CLIENT_BURST_LIMIT },
      (_, i) => now - i * 1000,
    );

    await waitForBurstSlot(full, { now, sleep });
    expect(sleep).toHaveBeenCalledOnce();
    expect(sleep).toHaveBeenCalledWith(
      msUntilBurstSlot(full, now) + BILLABLE_BURST_BUFFER_MS,
    );

    sleep.mockClear();
    await waitForBurstSlot(full.slice(0, 2), { now, sleep });
    expect(sleep).not.toHaveBeenCalled();
  });
});
