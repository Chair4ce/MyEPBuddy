"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { motionTransitionColors } from "@/lib/motion/classes";

const DESCRIPTION_ID = "marketing-email-opt-in-desc";

type MarketingEmailOptInCheckboxProps = {
  id?: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
};

export function MarketingEmailOptInCheckbox({
  id = "marketing-email-opt-in",
  checked,
  disabled = false,
  onCheckedChange,
}: MarketingEmailOptInCheckboxProps) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-lg border bg-background p-3",
        motionTransitionColors,
        "hover:bg-muted/50",
        disabled && "cursor-not-allowed opacity-60"
      )}
    >
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        className="mt-0.5 shrink-0"
        aria-describedby={DESCRIPTION_ID}
      />
      <span className="min-w-0 space-y-1">
        <span className="block text-sm font-medium leading-relaxed">
          Email me EPB cycle reminders before my closeout
        </span>
        <span
          id={DESCRIPTION_ID}
          className="block text-xs leading-relaxed text-muted-foreground"
        >
          Optional. Timed closeout reminders for your rank. Change this later:
          log in → Settings → Email preferences, or unsubscribe from any
          reminder. We never send to .mil addresses.
        </span>
      </span>
    </label>
  );
}
