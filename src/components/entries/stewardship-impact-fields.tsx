"use client";

/* eslint-disable react-refresh/only-export-components -- form helpers shared with entry-form-dialog */
import { CircleHelp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { motionChip } from "@/lib/motion/classes";
import {
  STEWARDSHIP_FIELD_MAX,
  STEWARDSHIP_HINTS,
  STEWARDSHIP_LABELS,
  STEWARDSHIP_PLACEHOLDERS,
} from "@/lib/stewardship-impact";
import type { StewardshipImpact } from "@/types/database";

export type StewardshipImpactFormValue = Required<{
  [K in keyof StewardshipImpact]: string;
}>;

export function emptyStewardshipFormValue(): StewardshipImpactFormValue {
  return { time: "", money: "", resources: "", outcome: "" };
}

export function stewardshipFormFromImpact(
  impact: StewardshipImpact
): StewardshipImpactFormValue {
  return {
    time: impact.time ?? "",
    money: impact.money ?? "",
    resources: impact.resources ?? "",
    outcome: impact.outcome ?? "",
  };
}

export function stewardshipImpactFromForm(
  form: StewardshipImpactFormValue
): StewardshipImpact {
  return {
    ...(form.time.trim() ? { time: form.time.trim() } : {}),
    ...(form.money.trim() ? { money: form.money.trim() } : {}),
    ...(form.resources.trim() ? { resources: form.resources.trim() } : {}),
    ...(form.outcome.trim() ? { outcome: form.outcome.trim() } : {}),
  };
}

const FIELDS: Array<{
  key: keyof StewardshipImpactFormValue;
  label: string;
  placeholder: string;
  hint: string;
}> = [
  {
    key: "time",
    label: STEWARDSHIP_LABELS.time,
    placeholder: STEWARDSHIP_PLACEHOLDERS.time,
    hint: STEWARDSHIP_HINTS.time,
  },
  {
    key: "money",
    label: STEWARDSHIP_LABELS.money,
    placeholder: STEWARDSHIP_PLACEHOLDERS.money,
    hint: STEWARDSHIP_HINTS.money,
  },
  {
    key: "resources",
    label: STEWARDSHIP_LABELS.resources,
    placeholder: STEWARDSHIP_PLACEHOLDERS.resources,
    hint: STEWARDSHIP_HINTS.resources,
  },
  {
    key: "outcome",
    label: STEWARDSHIP_LABELS.outcome,
    placeholder: STEWARDSHIP_PLACEHOLDERS.outcome,
    hint: STEWARDSHIP_HINTS.outcome,
  },
];

export interface StewardshipImpactFieldsProps {
  value: StewardshipImpactFormValue;
  onChange: (next: StewardshipImpactFormValue) => void;
  disabled?: boolean;
  idPrefix?: string;
  /** When education context is present — mission-tie copy for impact */
  educationAware?: boolean;
}

export function StewardshipImpactFields({
  value,
  onChange,
  disabled = false,
  idPrefix = "stewardship",
  educationAware = false,
}: StewardshipImpactFieldsProps) {
  return (
    <div className="space-y-2.5">
      <div className="space-y-0.5">
        <Label className="text-sm">Impact</Label>
        <p className="text-xs text-muted-foreground">
          {educationAware
            ? "How did this education enable mission results? (optional)"
            : "What did this buy back for the mission? (optional)"}
        </p>
      </div>
      <div className="grid grid-cols-[auto_1rem_minmax(0,1fr)] items-center gap-x-1.5 gap-y-2.5">
        {FIELDS.map((field) => {
          const fieldId = `${idPrefix}-${field.key}`;
          const hintId = `${fieldId}-hint`;
          const placeholder =
            educationAware && field.key === "outcome"
              ? "e.g. applied PME to cut qual timeline / mentored shop"
              : field.placeholder;
          return (
            <div key={field.key} className="contents">
              <Label
                htmlFor={fieldId}
                className="text-[11px] font-medium leading-tight text-muted-foreground whitespace-nowrap"
              >
                {field.label}
              </Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "inline-flex size-4 items-center justify-center justify-self-end rounded-sm text-muted-foreground/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                      motionChip
                    )}
                    aria-label={`${field.label} guidance`}
                    aria-describedby={hintId}
                  >
                    <CircleHelp className="size-3.5" aria-hidden="true" />
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  id={hintId}
                  side="top"
                  sideOffset={6}
                  className="max-w-[260px] text-xs leading-snug"
                >
                  {educationAware && field.key === "outcome"
                    ? "Tie the education to mission results — readiness, capacity, or unit improvement enabled by what was learned."
                    : field.hint}
                </TooltipContent>
              </Tooltip>
              <Input
                id={fieldId}
                value={value[field.key]}
                onChange={(e) =>
                  onChange({
                    ...value,
                    [field.key]: e.target.value.slice(0, STEWARDSHIP_FIELD_MAX),
                  })
                }
                placeholder={placeholder}
                disabled={disabled}
                aria-label={field.label}
                title={
                  educationAware && field.key === "outcome"
                    ? "Tie education to mission results"
                    : field.hint
                }
                className="h-9 text-sm"
                maxLength={STEWARDSHIP_FIELD_MAX}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
