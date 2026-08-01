#!/usr/bin/env node
/**
 * Flags legacy motion one-offs that the house system replaces.
 *
 *   node scripts/check-house-motion.mjs            # report; fail only on migrated surfaces
 *   node scripts/check-house-motion.mjs --strict   # fail on any hit (full-repo goal)
 *   node scripts/check-house-motion.mjs src/components/entries
 *
 * Migration is incremental: every file listed in ENFORCED_PATHS has already
 * been moved to `@/lib/motion/classes`, so a hit there is a regression and
 * exits 1. Everything else is reported as backlog and exits 0.
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const PATTERNS = [
  {
    re: /active:scale-9[05]\b/,
    label: "active:scale-95/100 (use motionPressable / t-press)",
  },
  {
    re: /active:scale-\[0\.9\d\]/,
    label: "hand-written active:scale-[0.9x] (use motionPressable / t-press)",
  },
  {
    re: /transition-all duration-(?:150|200|300)\b/,
    label: "transition-all duration-* (use motionTransitionInteractive)",
  },
  {
    re: /duration-\d+ ease-in-out\b/,
    label: "duration-* ease-in-out (use --duration-* + --ease-* tokens)",
  },
  {
    re: /\bease-in-out\b/,
    label: "ease-in-out (use ease-[var(--ease-smooth)] or --ease-close)",
  },
  {
    re: /\banimate-in\b/,
    label: "animate-in (use motionEnter* from @/lib/motion/classes)",
  },
  {
    re: /ease-\[cubic-bezier\(/,
    // Phrased without a bracket class literal on purpose: Tailwind's content
    // scanner reads this file and would try to compile a wildcard utility.
    label: "inline cubic-bezier (use an --ease-* variable token instead)",
  },
];

/** shadcn primitives keep their vendored Radix animations until migrated. */
const IGNORE_PATHS = [
  "src/components/ui/",
  // Sacred: EPB split view + sentence drag-and-drop keep bespoke motion.
  "src/components/epb/mpa-section-card.tsx",
  "src/components/epb/sentence-drop-overlay.tsx",
];

/** Already on the house system — a hit here is a regression, not backlog. */
const ENFORCED_PATHS = [
  "src/components/entries/fuse-to-epb-bar.tsx",
  "src/components/entries/fuse-to-epb-dialog.tsx",
  "src/components/entries/stewardship-impact-fields.tsx",
  "src/components/epb/impact-booster-panel.tsx",
];

const SCAN_ROOTS = ["src/components", "src/app"];

const args = process.argv.slice(2);
const strict = args.includes("--strict");
const scopeArgs = args.filter((a) => !a.startsWith("--"));

function listFiles() {
  const roots = scopeArgs.length > 0 ? scopeArgs : SCAN_ROOTS;
  const out = execSync(
    `rg --files ${roots.map((r) => JSON.stringify(r)).join(" ")} -g "*.tsx"`,
    { encoding: "utf8" }
  );
  return out
    .trim()
    .split("\n")
    .filter(Boolean)
    .filter((f) => !IGNORE_PATHS.some((p) => f.includes(p)))
    .sort();
}

const regressions = [];
const backlog = [];

for (const file of listFiles()) {
  const lines = readFileSync(file, "utf8").split("\n");
  const enforced = ENFORCED_PATHS.some((p) => file.includes(p));
  const seen = new Set();

  lines.forEach((line, index) => {
    for (const { re, label } of PATTERNS) {
      if (!re.test(line)) continue;
      const key = `${file}:${label}`;
      if (seen.has(key)) continue;
      seen.add(key);
      (enforced || strict ? regressions : backlog).push({
        file,
        line: index + 1,
        label,
      });
    }
  });
}

if (backlog.length > 0) {
  console.log(
    `check-house-motion: ${backlog.length} legacy hit(s) outside migrated surfaces (advisory):\n`
  );
  for (const v of backlog) {
    console.log(`  ${v.file}:${v.line} — ${v.label}`);
  }
  console.log("");
}

if (regressions.length > 0) {
  console.error(
    `check-house-motion: ${regressions.length} regression(s) on house-motion surfaces:\n`
  );
  for (const v of regressions) {
    console.error(`  ${v.file}:${v.line} — ${v.label}`);
  }
  console.error("\nUse helpers from @/lib/motion/classes.");
  process.exit(1);
}

console.log(
  backlog.length === 0
    ? "check-house-motion: OK — no legacy motion patterns found."
    : "check-house-motion: OK — no regressions on migrated surfaces."
);
