"use client";

// Force dynamic rendering - this page requires auth session
export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
import { Loader2, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { AppLogo } from "@/components/layout/app-logo";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isValidSession, setIsValidSession] = useState<boolean | null>(null);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    // Check if user has a valid recovery session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setIsValidSession(true);
      } else {
        setIsValidSession(false);
      }
    });
  }, [supabase.auth]);

  async function handlePasswordReset(e: React.FormEvent) {
    e.preventDefault();

    // Validate passwords match
    if (password !== confirmPassword) {
      toast.error("Passwords don't match");
      return;
    }

    // Validate password length
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) {
        toast.error(error.message);
        return;
      }

      setIsSuccess(true);
      toast.success("Password updated successfully!");

      // Redirect to dashboard after 2 seconds
      setTimeout(() => {
        router.push("/dashboard");
        router.refresh();
      }, 2000);
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  }

  // Show loading state while checking session
  if (isValidSession === null) {
    return (
      <div className="animate-fade-in">
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show error if no valid session
  if (isValidSession === false) {
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

        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl">Invalid or expired link</CardTitle>
            <CardDescription>
              This password reset link is invalid or has expired.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Password reset links expire after 1 hour. Please request a new
              reset link.
            </p>
            <Button asChild className="w-full">
              <Link href="/forgot-password">Request new reset link</Link>
            </Button>
          </CardContent>
          <CardFooter className="flex justify-center">
            <Link
              href="/login"
              className="text-sm text-muted-foreground hover:text-primary"
            >
              Back to sign in
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
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

      <Card>
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl">Set new password</CardTitle>
          <CardDescription>
            {isSuccess
              ? "Your password has been updated"
              : "Enter your new password below"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isSuccess ? (
            <div className="space-y-4">
              <div className="flex items-center justify-center p-6 rounded-lg bg-green-500/10 border border-green-500/20">
                <CheckCircle2 className="size-12 text-green-500" />
              </div>
              <div className="text-center space-y-2">
                <p className="font-medium">Password updated successfully!</p>
                <p className="text-sm text-muted-foreground">
                  Redirecting you to the dashboard...
                </p>
              </div>
            </div>
          ) : (
            <form onSubmit={handlePasswordReset} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">New password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={isLoading}
                    aria-label="New password"
                    autoComplete="new-password"
                    autoFocus
                    minLength={8}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Must be at least 8 characters
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm new password</Label>
                <div className="relative">
                  <Input
                    id="confirm-password"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    disabled={isLoading}
                    aria-label="Confirm new password"
                    autoComplete="new-password"
                    minLength={8}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  "Update password"
                )}
              </Button>
            </form>
          )}
        </CardContent>
        {!isSuccess && (
          <CardFooter className="flex justify-center">
            <Link
              href="/login"
              className="text-sm text-muted-foreground hover:text-primary"
            >
              Back to sign in
            </Link>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}
