"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "@/components/ui/sonner";
import { Loader2, ArrowLeft, Mail, AlertTriangle } from "lucide-react";
import { parseAuthError } from "@/lib/auth-errors";
import { Analytics } from "@/lib/analytics";
import { AppLogo } from "@/components/layout/app-logo";
import { ResizeContainer } from "@/components/ui/resize-container";

function ForgotPasswordContent() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const searchParams = useSearchParams();
  const supabase = createClient();

  useEffect(() => {
    // Check for error from callback (e.g., link opened in different browser)
    const error = searchParams.get("error");
    if (error === "link_expired") {
      toast.error("Password reset link expired or invalid", {
        description: "Please request a new password reset link.",
        duration: 6000,
      });
    }
  }, [searchParams]);

  async function handleResetRequest(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        const errorInfo = parseAuthError(error.message);
        
        // Show more helpful error for rate limits and email issues
        if (errorInfo.isRateLimit || errorInfo.isEmailDelivery) {
          toast.error(errorInfo.title, {
            description: errorInfo.action || errorInfo.message,
            duration: 8000,
          });
        } else {
          toast.error(errorInfo.message);
        }
        return;
      }

      Analytics.passwordResetRequested();
      setEmailSent(true);
      toast.success("Password reset email sent! Check your inbox.");
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="animate-fade-in">
      <div className="text-center mb-8">
        <div className="flex justify-center mb-3">
          <AppLogo size="xl" variant="stacked" />
        </div>
        <p className="text-muted-foreground mt-2">
          Your Air Force EPB writing assistant
        </p>
      </div>

      <ResizeContainer>
        <Card className="overflow-hidden">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl">Change your password</CardTitle>
            <CardDescription>
              {emailSent
                ? "Check your email for the password reset link"
                : "Need to sign in instead? Use a magic link on the sign-in page. Enter your email below only if you want to set a new password."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {emailSent ? (
              <div className="space-y-4" key="reset-email-sent">
              <div className="flex items-center justify-center p-6 rounded-lg bg-primary/10 border border-primary/20">
                <Mail className="size-12 text-primary" />
              </div>
              <div className="text-center space-y-2">
                <p className="text-sm text-muted-foreground">
                  We've sent a password reset link to:
                </p>
                <p className="font-medium">{email}</p>
                <p className="text-sm text-muted-foreground mt-4">
                  Click the link in the email to set a new password. The link
                  expires in 1 hour.
                </p>
                <p className="text-sm text-muted-foreground">
                  Just trying to sign in?{" "}
                  <Link href="/login" className="text-primary hover:underline">
                    Use a magic link instead
                  </Link>
                </p>
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setEmailSent(false);
                  setEmail("");
                }}
              >
                Send to a different email
              </Button>
            </div>
          ) : (
            <form onSubmit={handleResetRequest} className="space-y-4" key="reset-email-form">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@personal-email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isLoading}
                  aria-label="Email address"
                  autoComplete="email"
                  autoFocus
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  "Send reset link"
                )}
              </Button>
            </form>
          )}
        </CardContent>
        <CardFooter className="flex justify-center">
          <Link
            href="/login"
            className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-2"
          >
            <ArrowLeft className="size-4" />
            Back to sign in
          </Link>
        </CardFooter>
        </Card>
      </ResizeContainer>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={
      <div className="animate-fade-in">
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      </div>
    }>
      <ForgotPasswordContent />
    </Suspense>
  );
}
