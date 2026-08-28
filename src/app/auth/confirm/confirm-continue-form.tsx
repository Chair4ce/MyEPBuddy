"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { confirmEmailOtpToken } from "./actions";
import type { AppEmailOtpType } from "@/lib/auth/email-otp";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending} aria-busy={pending}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : label}
    </Button>
  );
}

export function ConfirmContinueForm({
  tokenHash,
  type,
  next,
  submitLabel,
}: {
  tokenHash: string;
  type: AppEmailOtpType;
  next: string;
  submitLabel: string;
}) {
  return (
    <form action={confirmEmailOtpToken} className="space-y-3">
      <input type="hidden" name="token_hash" value={tokenHash} />
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="next" value={next} />
      <SubmitButton label={submitLabel} />
    </form>
  );
}
