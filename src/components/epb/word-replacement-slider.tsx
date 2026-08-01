"use client";

import { cn } from "@/lib/utils";

function levelLabel(value: number): string {
  if (value <= 20) return "Minimal";
  if (value <= 40) return "Conservative";
  if (value <= 60) return "Moderate";
  if (value <= 80) return "Aggressive";
  return "Maximum";
}

function levelHint(value: number): string {
  if (value <= 20) return "Only fix weak spots — still prefer a new verb when one exists";
  if (value <= 40) return "Light refresh — swap weak words; avoid repeating the original verbs";
  if (value <= 60) return "Balanced rewrite — new verbs & phrasing; keep facts only";
  if (value <= 80) return "Heavy rewrite — reuse original words only if no synonym fits";
  return "Full rewrite — preserve metrics & proper nouns only";
}

export interface WordReplacementSliderProps {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
}

export function WordReplacementSlider({
  value,
  onChange,
  disabled = false,
  id = "word-replacement",
  className,
}: WordReplacementSliderProps) {
  const clamped = Math.max(0, Math.min(100, value));

  return (
    <div
      className={cn(
        "rounded-md border border-primary/25 bg-primary/[0.04] px-3 py-2.5 space-y-2",
        "shadow-[0_1px_2px_rgba(0,0,0,0.04),0_0_0_0.5px_color-mix(in_oklab,var(--primary)_22%,transparent)]",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-xs font-semibold text-foreground">
          Word replacement
        </label>
        <span className="text-xs font-semibold tabular-nums text-primary">
          {levelLabel(clamped)}
          <span className="text-muted-foreground font-medium"> · {clamped}%</span>
        </span>
      </div>

      <div className="flex items-center gap-2.5">
        <span className="text-[10px] font-medium text-muted-foreground shrink-0 w-14">
          Keep most
        </span>
        <input
          id={id}
          type="range"
          min={0}
          max={100}
          step={10}
          value={clamped}
          disabled={disabled}
          aria-label={`Word replacement level: ${levelLabel(clamped)} at ${clamped} percent`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={clamped}
          aria-valuetext={`${levelLabel(clamped)}, ${clamped} percent`}
          onChange={(e) => onChange(Number(e.target.value))}
          className={cn(
            "flex-1 h-2.5 appearance-none cursor-pointer rounded-full disabled:opacity-50 disabled:pointer-events-none",
            "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:rounded-full",
            "[&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-[0_1px_3px_rgba(0,0,0,0.25),0_0_0_0.5px_color-mix(in_oklab,var(--primary)_50%,transparent)]",
            "[&::-webkit-slider-thumb]:active:scale-[0.98] [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:duration-150",
            "[&::-webkit-slider-thumb]:ease-[cubic-bezier(0.22,1,0.36,1)]",
            "[&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0",
            "[&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:shadow-[0_1px_3px_rgba(0,0,0,0.25)]"
          )}
          style={{
            background: `linear-gradient(to right, var(--primary) ${clamped}%, color-mix(in oklab, var(--primary) 18%, var(--muted)) ${clamped}%)`,
          }}
        />
        <span className="text-[10px] font-medium text-muted-foreground shrink-0 w-14 text-right">
          Replace all
        </span>
      </div>

      <p className="text-[10px] text-muted-foreground leading-snug">{levelHint(clamped)}</p>
    </div>
  );
}
