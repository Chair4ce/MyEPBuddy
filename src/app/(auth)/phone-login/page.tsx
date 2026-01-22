"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { PhoneInput } from "@/components/ui/phone-input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { toast } from "@/components/ui/sonner";
import { Loader2, ArrowLeft, Smartphone } from "lucide-react";
import { AppLogo } from "@/components/layout/app-logo";

// Format phone number for masked display: +1 (***) ***-XXXX
function formatPhoneForMaskedDisplay(digits: string): string {
  if (digits.length !== 10) return `+1 ***-${digits.slice(-4)}`;
  return `+1 (***) ***-${digits.slice(6)}`;
}

// SECURITY: Track last OTP request to prevent rate limit bypass via refresh
function getLastOtpRequest(phone: string): number | null {
  if (typeof window === 'undefined') return null;
  const key = `otp_last_${phone.replace(/\D/g, '')}`;
  const stored = localStorage.getItem(key);
  return stored ? parseInt(stored, 10) : null;
}

function setLastOtpRequest(phone: string): void {
  if (typeof window === 'undefined') return;
  const key = `otp_last_${phone.replace(/\D/g, '')}`;
  localStorage.setItem(key, Date.now().toString());
}

export default function PhoneLoginPage() {
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [canResend, setCanResend] = useState(false);
  const [showSignupOption, setShowSignupOption] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const router = useRouter();
  const supabase = createClient();

  async function handleSendOTP(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setShowSignupOption(false);

    // phone now contains just the 10 digits from PhoneInput
    const digitsOnly = phone.replace(/\D/g, '');
    
    // SECURITY: Validate phone number format - must be exactly 10 digits
    if (digitsOnly.length !== 10) {
      toast.error("Please enter a complete 10-digit phone number");
      setIsLoading(false);
      return;
    }

    // SECURITY: Check client-side rate limit (prevent bypass via refresh)
    const lastRequest = getLastOtpRequest(digitsOnly);
    if (lastRequest && Date.now() - lastRequest < 60000) {
      const secondsRemaining = Math.ceil((60000 - (Date.now() - lastRequest)) / 1000);
      toast.error(`Please wait ${secondsRemaining} seconds before requesting another code`);
      setIsLoading(false);
      return;
    }

    // Format phone number to E.164 format
    const formattedPhone = `+1${digitsOnly}`;

    try {
      // Try to sign in with phone (won't create new user)
      const { error } = await supabase.auth.signInWithOtp({
        phone: formattedPhone,
        options: {
          shouldCreateUser: false, // Don't auto-create new users
        },
      });

      if (error) {
        // SECURITY: Use generic message to prevent phone enumeration
        // Don't reveal whether phone exists or not
        setShowSignupOption(true);
        toast.error("Unable to send verification code. See options below.");
        return;
      }

      // SECURITY: Track request timestamp to prevent rate limit bypass
      setLastOtpRequest(digitsOnly);
      
      setOtpSent(true);
      toast.success("Verification code sent! Check your phone.");

      // Enable resend after 60 seconds
      setTimeout(() => setCanResend(true), 60000);
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleVerifyOTP(e: React.FormEvent) {
    e.preventDefault();

    if (otp.length !== 6) {
      toast.error("Please enter the complete 6-digit code");
      return;
    }

    setIsLoading(true);

    // phone contains just the 10 digits
    const formattedPhone = `+1${phone.replace(/\D/g, '')}`;

    try {
      const { error } = await supabase.auth.verifyOtp({
        phone: formattedPhone,
        token: otp,
        type: 'sms',
      });

      if (error) {
        // SECURITY: Clear OTP on failed verification to prevent reuse attempts
        setOtp("");
        setFailedAttempts((prev) => prev + 1);
        
        // SECURITY: Lock out after 5 failed attempts
        if (failedAttempts >= 4) {
          toast.error("Too many failed attempts. Please request a new code.");
          setOtpSent(false);
          setFailedAttempts(0);
          return;
        }
        
        toast.error(`Invalid or expired code. ${5 - failedAttempts - 1} attempts remaining.`);
        return;
      }

      // Check if user has completed their profile
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        const { data: profile } = (await supabase
          .from("profiles")
          .select("email")
          .eq("id", user.id)
          .maybeSingle()) as { data: { email: string } | null };

        if (!profile?.email) {
          // New phone user, needs to complete profile
          toast.success("Phone verified! Please complete your profile.");
          router.push("/complete-profile");
        } else {
          // Existing user
          toast.success("Signed in successfully!");
          router.push("/dashboard");
        }
        router.refresh();
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleResendOTP() {
    setCanResend(false);
    setOtp("");
    await handleSendOTP(new Event('submit') as unknown as React.FormEvent);
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
          <CardTitle className="text-2xl">
            {otpSent ? "Verify your phone" : "Sign in with phone"}
          </CardTitle>
          <CardDescription>
            {otpSent
              ? "Enter the 6-digit code sent to your phone"
              : "Enter your phone number to receive a verification code"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {otpSent ? (
            <form onSubmit={handleVerifyOTP} className="space-y-6">
              <div className="flex items-center justify-center p-6 rounded-lg bg-primary/10 border border-primary/20">
                <Smartphone className="size-12 text-primary" />
              </div>

              <div className="text-center space-y-2">
                <p className="text-sm text-muted-foreground">
                  Code sent to:
                </p>
                <p className="font-medium font-mono">{formatPhoneForMaskedDisplay(phone)}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="otp" className="text-center block">
                  Verification Code
                </Label>
                <div className="flex justify-center">
                  <InputOTP
                    maxLength={6}
                    value={otp}
                    onChange={setOtp}
                    disabled={isLoading}
                  >
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                <p className="text-xs text-center text-muted-foreground">
                  Code expires in 60 minutes
                </p>
              </div>

              <div className="space-y-3">
                <Button
                  type="submit"
                  className="w-full"
                  disabled={isLoading || otp.length !== 6}
                >
                  {isLoading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    "Verify and sign in"
                  )}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={handleResendOTP}
                  disabled={!canResend || isLoading}
                >
                  {canResend ? "Resend code" : "Resend available in 60s"}
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => {
                    setOtpSent(false);
                    setOtp("");
                    setPhone("");
                  }}
                >
                  Use different phone number
                </Button>
              </div>
            </form>
            ) : (
            <>
              <form onSubmit={handleSendOTP} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <PhoneInput
                    id="phone"
                    value={phone}
                    onChange={(value) => {
                      setPhone(value);
                      setShowSignupOption(false); // Reset when user changes phone
                    }}
                    disabled={isLoading}
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter your 10-digit US phone number
                  </p>
                </div>
                <Button type="submit" className="w-full" disabled={isLoading || phone.length !== 10}>
                  {isLoading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    "Send verification code"
                  )}
                </Button>
              </form>

              {showSignupOption && (
                <div className="mt-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg space-y-4">
                  <p className="text-sm text-amber-900 dark:text-amber-100 font-medium">
                    Unable to verify phone
                  </p>
                  <p className="text-sm text-amber-800 dark:text-amber-200">
                    If you have an existing account, you can:
                  </p>
                  <div className="space-y-2">
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left h-auto py-3 border-amber-300 dark:border-amber-700"
                      onClick={() => router.push("/login")}
                    >
                      <div>
                        <p className="font-medium text-sm">
                          Sign in with email first
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Then add your phone number in Settings
                        </p>
                      </div>
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left h-auto py-3 border-amber-300 dark:border-amber-700"
                      onClick={() => router.push("/signup")}
                    >
                      <div>
                        <p className="font-medium text-sm">
                          Create a new account
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Sign up with email or continue with phone
                        </p>
                      </div>
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Link
            href="/login"
            className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-2"
          >
            <ArrowLeft className="size-4" />
            Back to sign in
          </Link>
          <div className="space-y-2">
            <p className="text-xs text-center text-muted-foreground">
              By continuing, you agree to receive SMS verification codes. Message
              and data rates may apply.
            </p>
            <p className="text-xs text-center text-muted-foreground">
              🔒 SMS is less secure than app-based authentication. For sensitive operations, use email + password.
            </p>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
