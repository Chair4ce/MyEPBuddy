"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { Loader2 } from "lucide-react";
import { Analytics } from "@/lib/analytics";
import { parseAuthError } from "@/lib/auth-errors";
import {
  parseConfirmEmail,
  parseEmailOtpCode,
  redirectPathForEmailOtpType,
  type AppEmailOtpType,
} from "@/lib/auth/email-otp";
import { cn } from "@/lib/utils";
import { motionInputFocus } from "@/lib/motion/classes";

const MAX_ATTEMPTS = 5;

export function EmailOtpCodeForm({
  email: emailProp,
  type,
  nextPath = "/dashboard",
  submitLabel,
  idPrefix,
}: {
  email?: string;
  type: AppEmailOtpType;
  nextPath?: string;
  submitLabel: string;
  idPrefix: string;
}) {
  const [email, setEmail] = useState(emailProp ?? "");
  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [locked, setLocked] = useState(false);
  const router = useRouter();
  const supabase = createClient();
  const emailLocked = Boolean(emailProp);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const normalizedEmail = parseConfirmEmail(email);
    const token = parseEmailOtpCode(code);
    if (!normalizedEmail) {
      toast.error("Enter the email address the code was sent to");
      return;
    }
    if (!token) {
      toast.error("Enter the 6–8 digit code from your email");
      return;
    }
    if (locked) {
      toast.error("Too many failed attempts. Request a new email and try again.");
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: normalizedEmail,
        token,
        type,
      });

      if (error) {
        setCode("");
        const nextFailures = failedAttempts + 1;
        setFailedAttempts(nextFailures);
        if (nextFailures >= MAX_ATTEMPTS) {
          setLocked(true);
          toast.error("Too many failed attempts. Request a new email and try again.");
          return;
        }
        const remaining = MAX_ATTEMPTS - nextFailures;
        const info = parseAuthError(error.message);
        toast.error(
          info.isRateLimit ? info.title : "Invalid or expired code",
          {
            description: info.isRateLimit
              ? info.action || info.message
              : `${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
          }
        );
        return;
      }

      if (type === "magiclink" || type === "email") {
        Analytics.login("magic_link");
      }

      toast.success(
        type === "recovery"
          ? "Code verified. Set a new password."
          : type === "signup"
            ? "Email confirmed. You're signed in."
            : "Signed in successfully!"
      );
      router.push(redirectPathForEmailOtpType(type, nextPath));
      router.refresh();
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-email`}>Email</Label>
        <Input
          id={`${idPrefix}-email`}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={isLoading || emailLocked}
          autoComplete="email"
          aria-label="Email address the code was sent to"
          className={cn(motionInputFocus)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-code`}>Email code</Label>
        <Input
          id={`${idPrefix}-code`}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]{6,11}"
          maxLength={11}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/[^\d\s]/g, ""))}
          required
          disabled={isLoading || locked}
          aria-label="6 to 8 digit code from your email"
          placeholder="12345678"
          className={cn("font-mono tracking-widest", motionInputFocus)}
        />
        <p className="text-xs text-muted-foreground">
          Use the code from the email if a government proxy opened the link
          for you.
        </p>
      </div>
      <Button type="submit" className="w-full" disabled={isLoading || locked}>
        {isLoading ? <Loader2 className="size-4 animate-spin" /> : submitLabel}
      </Button>
    </form>
  );
}
