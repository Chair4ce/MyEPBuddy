"use client";

import { GraduationCap } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { motionChip, motionCollapseGrid } from "@/lib/motion/classes";
import {
  EDUCATION_CREDIT_UNITS,
  type EducationContext,
  type EducationCreditUnit,
  hasEducationContext,
} from "@/lib/education-context";

export type EducationContextFormValue = {
  enabled: boolean;
  program: string;
  credits: string;
  unit: EducationCreditUnit;
  completed_date: string;
};

export function emptyEducationFormValue(): EducationContextFormValue {
  return {
    enabled: false,
    program: "",
    credits: "",
    unit: "credit_hours",
    completed_date: "",
  };
}

export function educationFormFromContext(
  ctx: EducationContext | null | undefined
): EducationContextFormValue {
  if (!hasEducationContext(ctx)) return emptyEducationFormValue();
  return {
    enabled: true,
    program: ctx!.program,
    credits: ctx!.credits != null ? String(ctx!.credits) : "",
    unit: ctx!.unit ?? "credit_hours",
    completed_date: ctx!.completed_date ?? "",
  };
}

export function educationContextFromForm(
  form: EducationContextFormValue
): EducationContext | null {
  if (!form.enabled || !form.program.trim()) return null;
  const creditsRaw = form.credits.trim();
  const credits = creditsRaw ? Number(creditsRaw) : undefined;
  return {
    program: form.program.trim(),
    ...(credits != null && Number.isFinite(credits) && credits > 0
      ? { credits, unit: form.unit }
      : {}),
    ...(form.completed_date ? { completed_date: form.completed_date } : {}),
  };
}

type EducationContextFieldsProps = {
  value: EducationContextFormValue;
  onChange: (next: EducationContextFormValue) => void;
  disabled?: boolean;
  onEnabledFirstTime?: () => void;
};

export function EducationContextFields({
  value,
  onChange,
  disabled = false,
  onEnabledFirstTime,
}: EducationContextFieldsProps) {
  const patch = (partial: Partial<EducationContextFormValue>) => {
    onChange({ ...value, ...partial });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-sm flex items-center gap-1.5">
          <GraduationCap className="size-3.5 text-muted-foreground" />
          Education
          <span className="text-muted-foreground font-normal text-xs">
            (optional)
          </span>
        </Label>
        <Button
          type="button"
          variant={value.enabled ? "secondary" : "outline"}
          size="sm"
          className={cn(motionChip, "h-7 text-xs")}
          disabled={disabled}
          aria-pressed={value.enabled}
          aria-label={
            value.enabled ? "Hide education fields" : "Add education context"
          }
          onClick={() => {
            const next = !value.enabled;
            patch({ enabled: next });
            if (next) onEnabledFirstTime?.();
          }}
        >
          {value.enabled ? "Remove" : "Add"}
        </Button>
      </div>

      <div
        className={motionCollapseGrid}
        data-open={value.enabled ? "true" : "false"}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="space-y-3 pt-1 pb-1">
            <p className="text-xs text-muted-foreground">
              Capture the program/credits as context. Your action and impact
              should describe how that education supported the mission.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="education_program" className="text-sm">
                Program / course *
              </Label>
              <Input
                id="education_program"
                placeholder="e.g. CCAF AAS, ALS, CompTIA Security+"
                value={value.program}
                onChange={(e) => patch({ program: e.target.value })}
                disabled={disabled}
                className="h-9 sm:h-10 text-sm"
                aria-label="Education program or course"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="education_credits" className="text-sm">
                  Credits / hours
                </Label>
                <Input
                  id="education_credits"
                  type="number"
                  min={0}
                  step="0.5"
                  inputMode="decimal"
                  placeholder="e.g. 12"
                  value={value.credits}
                  onChange={(e) => patch({ credits: e.target.value })}
                  disabled={disabled}
                  className="h-9 sm:h-10 text-sm"
                  aria-label="Education credits or hours"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Unit</Label>
                <Select
                  value={value.unit}
                  disabled={disabled}
                  onValueChange={(v) =>
                    patch({ unit: v as EducationCreditUnit })
                  }
                >
                  <SelectTrigger
                    className="h-9 sm:h-10 text-sm"
                    aria-label="Credit unit"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EDUCATION_CREDIT_UNITS.map((u) => (
                      <SelectItem key={u.value} value={u.value}>
                        {u.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="education_completed" className="text-sm">
                Completed
                <span className="text-muted-foreground font-normal ml-1 text-xs">
                  (optional)
                </span>
              </Label>
              <Input
                id="education_completed"
                type="date"
                value={value.completed_date}
                onChange={(e) => patch({ completed_date: e.target.value })}
                disabled={disabled}
                className="h-9 sm:h-10 text-sm"
                aria-label="Education completion date"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
