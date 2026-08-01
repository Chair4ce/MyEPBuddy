"use client";

import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  MAX_PURCHASE_PACKS,
  MIN_PURCHASE_PACKS,
  PURCHASE_CREDITS,
  PURCHASE_PRICE_USD,
} from "@/lib/billing/constants";
import { cn } from "@/lib/utils";

const PRESET_PACKS = [1, 2, 5, 10] as const;

type TokenPackQuantityPickerProps = {
  packs: number;
  onPacksChange: (packs: number) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
};

function clampPacks(value: number): number {
  if (!Number.isFinite(value)) return MIN_PURCHASE_PACKS;
  return Math.min(
    MAX_PURCHASE_PACKS,
    Math.max(MIN_PURCHASE_PACKS, Math.trunc(value)),
  );
}

export function TokenPackQuantityPicker({
  packs,
  onPacksChange,
  disabled = false,
  className,
  id = "token-pack-quantity",
}: TokenPackQuantityPickerProps) {
  const safePacks = clampPacks(packs);
  const tokens = safePacks * PURCHASE_CREDITS;
  const priceUsd = safePacks * PURCHASE_PRICE_USD;

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Quick amounts">
        {PRESET_PACKS.map((preset) => {
          const selected = safePacks === preset;
          return (
            <Button
              key={preset}
              type="button"
              size="sm"
              variant={selected ? "default" : "outline"}
              disabled={disabled}
              aria-pressed={selected}
              className="active:scale-[0.98] transition-transform duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]"
              onClick={() => onPacksChange(preset)}
            >
              {preset * PURCHASE_CREDITS}
            </Button>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="icon"
          variant="outline"
          disabled={disabled || safePacks <= MIN_PURCHASE_PACKS}
          aria-label={`Decrease by ${PURCHASE_CREDITS} tokens`}
          className="shrink-0 active:scale-[0.98] transition-transform duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]"
          onClick={() => onPacksChange(clampPacks(safePacks - 1))}
        >
          <Minus className="size-4" />
        </Button>
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={MIN_PURCHASE_PACKS * PURCHASE_CREDITS}
          max={MAX_PURCHASE_PACKS * PURCHASE_CREDITS}
          step={PURCHASE_CREDITS}
          value={tokens}
          disabled={disabled}
          aria-label="Token amount"
          aria-describedby={`${id}-help`}
          className="text-center tabular-nums"
          onChange={(event) => {
            const raw = Number(event.target.value);
            if (!Number.isFinite(raw)) return;
            // Accept token counts; round down to nearest pack.
            onPacksChange(
              clampPacks(Math.floor(raw / PURCHASE_CREDITS) || MIN_PURCHASE_PACKS),
            );
          }}
        />
        <Button
          type="button"
          size="icon"
          variant="outline"
          disabled={disabled || safePacks >= MAX_PURCHASE_PACKS}
          aria-label={`Increase by ${PURCHASE_CREDITS} tokens`}
          className="shrink-0 active:scale-[0.98] transition-transform duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]"
          onClick={() => onPacksChange(clampPacks(safePacks + 1))}
        >
          <Plus className="size-4" />
        </Button>
      </div>

      <p id={`${id}-help`} className="text-sm text-muted-foreground">
        {tokens.toLocaleString()} tokens · ${priceUsd.toLocaleString()} one-time ·{" "}
        ${PURCHASE_PRICE_USD} per {PURCHASE_CREDITS}
      </p>
    </div>
  );
}
