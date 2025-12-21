"use client";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { Loader2, ExternalLink, Copy, Check } from "lucide-react";
import { RANKS } from "@/lib/constants";
import type { Rank } from "@/types/database";

// Detect if running in a restricted browser context (in-app browsers, PWAs)
function isRestrictedBrowser(): { restricted: boolean; browserName: string } {
  if (typeof window === "undefined") return { restricted: false, browserName: "" };

  const ua = navigator.userAgent || "";

  // Check for standalone PWA
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window.navigator as any).standalone === true;

  if (isStandalone) return { restricted: true, browserName: "this app" };

  // Detect specific in-app browsers
  if (/LinkedIn/i.test(ua)) return { restricted: true, browserName: "LinkedIn" };
  if (/FBAN|FBAV/i.test(ua)) return { restricted: true, browserName: "Facebook" };
  if (/Instagram/i.test(ua)) return { restricted: true, browserName: "Instagram" };
  if (/Twitter/i.test(ua)) return { restricted: true, browserName: "Twitter/X" };
  if (/Snapchat/i.test(ua)) return { restricted: true, browserName: "Snapchat" };
  if (/Slack/i.test(ua)) return { restricted: true, browserName: "Slack" };
  if (/Line\//i.test(ua)) return { restricted: true, browserName: "Line" };
  if (/KAKAOTALK/i.test(ua)) return { restricted: true, browserName: "KakaoTalk" };
  if (/WeChat|MicroMessenger/i.test(ua)) return { restricted: true, browserName: "WeChat" };

  return { restricted: false, browserName: "" };
}

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [rank, setRank] = useState<Rank | "">("");
  const [afsc, setAfsc] = useState("");
  const [unit, setUnit] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [restrictedBrowser, setRestrictedBrowser] = useState<{
    restricted: boolean;
    browserName: string;
  }>({ restricted: false, browserName: "" });
  const [copied, setCopied] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    setRestrictedBrowser(isRestrictedBrowser());
  }, []);

  async function handleEmailSignup(e: React.FormEvent) {
    e.preventDefault();

    if (!rank) {
      toast.error("Please select your rank");
      return;
    }

    setIsLoading(true);

    try {
      // All users are members - team relationships determine supervision
      const role = "member";

      const { error: signUpError, data } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: {
            full_name: fullName,
          },
        },
      });

      if (signUpError) {
        toast.error(signUpError.message);
        return;
      }

      // Update profile with additional info
      if (data.user) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: profileError } = await (supabase as any)
          .from("profiles")
          .update({
            full_name: fullName,
            rank,
            afsc,
            unit,
            role,
          })
          .eq("id", data.user.id);

        if (profileError) {
          console.error("Profile update error:", profileError);
        }
      }

      toast.success("Account created! Please check your email to verify.");
      router.push("/login");
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleGoogleSignup() {
    // Don't allow Google signup from restricted browsers - they need to open in real browser
    if (restrictedBrowser.restricted) {
      toast.error(
        `Google sign-in doesn't work in ${restrictedBrowser.browserName}. Please open in Safari or Chrome.`
      );
      return;
    }

    setIsGoogleLoading(true);

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        toast.error(error.message);
        setIsGoogleLoading(false);
      }
    } catch {
      toast.error("An unexpected error occurred");
      setIsGoogleLoading(false);
    }
  }

  async function handleCopyUrl() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      toast.success("URL copied! Paste it in Safari or Chrome.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy URL");
    }
  }

  return (
    <div className="animate-fade-in">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
          My EPBuddy
        </h1>
        <p className="text-muted-foreground mt-2">
          Your Air Force EPB writing assistant
        </p>
      </div>

      {/* Warning banner for in-app browsers */}
      {restrictedBrowser.restricted && (
        <Card className="mb-4 border-amber-500/50 bg-amber-500/10">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-3">
              <ExternalLink className="size-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="space-y-2 flex-1">
                <p className="text-sm font-medium text-amber-500">
                  Open in Safari or Chrome
                </p>
                <p className="text-xs text-muted-foreground">
                  Google sign-in doesn&apos;t work in {restrictedBrowser.browserName}&apos;s browser. 
                  Copy this link and paste it in Safari or Chrome.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyUrl}
                  className="mt-2 w-full border-amber-500/50 hover:bg-amber-500/20"
                >
                  {copied ? (
                    <Check className="size-4 text-green-500" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                  {copied ? "Copied!" : "Copy URL"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl">Create an account</CardTitle>
          <CardDescription>
            Sign up to start tracking accomplishments
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            variant="outline"
            className="w-full"
            onClick={handleGoogleSignup}
            disabled={isGoogleLoading || isLoading || restrictedBrowser.restricted}
          >
            {isGoogleLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <svg className="size-4" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
            )}
            Continue with Google
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">
                Or continue with email
              </span>
            </div>
          </div>

          <form onSubmit={handleEmailSignup} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  placeholder="John Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  disabled={isLoading}
                  aria-label="Full name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rank">Rank</Label>
                <Select
                  value={rank}
                  onValueChange={(value) => setRank(value as Rank)}
                  disabled={isLoading}
                >
                  <SelectTrigger id="rank" aria-label="Select rank">
                    <SelectValue placeholder="Select rank" />
                  </SelectTrigger>
                  <SelectContent>
                    {RANKS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="afsc">AFSC</Label>
                <Input
                  id="afsc"
                  placeholder="1N0X1"
                  value={afsc}
                  onChange={(e) => setAfsc(e.target.value.toUpperCase())}
                  disabled={isLoading}
                  aria-label="Air Force Specialty Code"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="unit">Unit</Label>
                <Input
                  id="unit"
                  placeholder="25 IS"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  disabled={isLoading}
                  aria-label="Unit"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="your.email@mail.mil"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
                aria-label="Email address"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                disabled={isLoading}
                aria-label="Password"
              />
              <p className="text-xs text-muted-foreground">
                Minimum 8 characters
              </p>
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading || isGoogleLoading}
            >
              {isLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Create account"
              )}
            </Button>
          </form>
        </CardContent>
        <CardFooter>
          <p className="text-sm text-muted-foreground w-full text-center">
            Already have an account?{" "}
            <Link href="/login" className="text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}

