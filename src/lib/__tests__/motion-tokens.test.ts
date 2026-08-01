import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CHEVRON_DUR_MS,
  DURATION_FAST_MS,
  DURATION_NORMAL_MS,
  DURATION_SLOW_MS,
  EASE_CLOSE,
  EASE_OUT,
  EASE_OUT_STRONG,
  EASE_SMOOTH,
  EASE_SPRING,
  LIST_ENTER_DUR_MS,
  LIST_ENTER_STAGGER_MS,
  PRESS_SCALE,
  REVEAL_BLUR_PX,
  REVEAL_RISE_PX,
} from "@/lib/motion/tokens";
import {
  motionEnter,
  motionListEnterStagger,
  motionPressable,
} from "@/lib/motion/classes";

const GLOBALS_CSS = readFileSync(
  path.resolve(__dirname, "../../app/globals.css"),
  "utf8"
);

describe("house motion tokens", () => {
  it("matches the documented easing curve table", () => {
    expect(EASE_SMOOTH).toBe("cubic-bezier(0.22, 1, 0.36, 1)");
    expect(EASE_OUT).toBe("cubic-bezier(0.16, 1, 0.3, 1)");
    expect(EASE_OUT_STRONG).toBe("cubic-bezier(0.23, 1, 0.32, 1)");
    expect(EASE_SPRING).toBe("cubic-bezier(0.34, 1.45, 0.64, 1)");
    expect(EASE_CLOSE).toBe("cubic-bezier(0.4, 0, 0.2, 1)");
  });

  it("keeps frequent UI durations under 300ms", () => {
    expect(DURATION_FAST_MS).toBe(150);
    expect(DURATION_NORMAL_MS).toBe(200);
    expect(DURATION_SLOW_MS).toBe(280);
    expect(LIST_ENTER_DUR_MS).toBe(240);
    expect(CHEVRON_DUR_MS).toBe(160);
    for (const ms of [
      DURATION_FAST_MS,
      DURATION_NORMAL_MS,
      DURATION_SLOW_MS,
      LIST_ENTER_DUR_MS,
      CHEVRON_DUR_MS,
    ]) {
      expect(ms).toBeLessThan(300);
    }
  });

  it("uses the MyEPBuddy press scale of 0.98, not PeriDocs 0.99", () => {
    expect(PRESS_SCALE).toBe(0.98);
  });

  it("keeps the entrance rise/blur small enough to read as focus, not flight", () => {
    expect(REVEAL_RISE_PX).toBe(6);
    expect(REVEAL_BLUR_PX).toBe(2);
    expect(LIST_ENTER_STAGGER_MS).toBeLessThanOrEqual(40);
  });
});

describe("globals.css stays in sync with tokens.ts", () => {
  const cssVar = (name: string): string => {
    const match = GLOBALS_CSS.match(
      new RegExp(`^\\s*--${name}:\\s*([^;]+);`, "m")
    );
    if (!match) throw new Error(`--${name} not found in globals.css`);
    return match[1].trim();
  };

  it("mirrors every easing curve", () => {
    expect(cssVar("ease-smooth")).toBe(EASE_SMOOTH);
    expect(cssVar("ease-out")).toBe(EASE_OUT);
    expect(cssVar("ease-out-strong")).toBe(EASE_OUT_STRONG);
    expect(cssVar("ease-spring")).toBe(EASE_SPRING);
    expect(cssVar("ease-close")).toBe(EASE_CLOSE);
  });

  it("mirrors durations, reveal geometry, and press scale", () => {
    expect(cssVar("duration-fast")).toBe(`${DURATION_FAST_MS}ms`);
    expect(cssVar("duration-normal")).toBe(`${DURATION_NORMAL_MS}ms`);
    expect(cssVar("duration-slow")).toBe(`${DURATION_SLOW_MS}ms`);
    expect(cssVar("list-enter-dur")).toBe(`${LIST_ENTER_DUR_MS}ms`);
    expect(cssVar("list-enter-stagger")).toBe(`${LIST_ENTER_STAGGER_MS}ms`);
    expect(cssVar("chevron-dur")).toBe(`${CHEVRON_DUR_MS}ms`);
    expect(cssVar("reveal-rise")).toBe(`${REVEAL_RISE_PX}px`);
    expect(cssVar("reveal-blur")).toBe(`${REVEAL_BLUR_PX}px`);
    expect(cssVar("press-scale")).toBe(String(PRESS_SCALE));
  });

  it("guards every entrance utility behind prefers-reduced-motion", () => {
    const reducedMotionBlocks = GLOBALS_CSS.split(
      "@media (prefers-reduced-motion: reduce)"
    ).slice(1);
    const guarded = reducedMotionBlocks.join("\n");
    for (const utility of [
      ".t-press",
      ".t-enter",
      ".t-enter-fade",
      ".t-enter-zoom",
      ".t-collapse-grid",
    ]) {
      expect(guarded).toContain(utility);
    }
  });
});

describe("motion class helpers", () => {
  it("points at the backing utilities defined in globals.css", () => {
    expect(motionPressable.split(" ")).toContain("t-press");
    expect(GLOBALS_CSS).toContain(".t-press");
    expect(motionEnter.split(" ")[0]).toBe("t-enter");
  });

  it("carries its own transition so t-press never owns transition-property", () => {
    expect(motionPressable).toContain("transition-transform");
    expect(motionPressable).toContain("duration-[var(--duration-fast)]");
    expect(motionPressable).toContain("ease-[var(--ease-smooth)]");
    // `.t-press` must only declare the :active transform — otherwise composing
    // it with another transition utility silently drops that transition.
    const pressRules = GLOBALS_CSS.match(/^\.t-press[^{]*\{[^}]*\}/gm) ?? [];
    expect(pressRules.length).toBeGreaterThan(0);
    for (const rule of pressRules) {
      expect(rule).not.toContain("transition");
    }
  });

  it("staggers list rows off the shared CSS variable", () => {
    expect(motionListEnterStagger(0).animationDelay).toBe(
      "calc(0 * var(--list-enter-stagger))"
    );
    expect(motionListEnterStagger(3).animationDelay).toBe(
      "calc(3 * var(--list-enter-stagger))"
    );
  });
});
