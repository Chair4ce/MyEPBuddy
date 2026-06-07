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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/sonner";
import {
  Loader2,
  ExternalLink,
  Copy,
  Check,
  Smartphone,
  Mail,
  KeyRound,
} from "lucide-react";
import { parseAuthError } from "@/lib/auth-errors";
import { Analytics } from "@/lib/analytics";
import { AppLogo } from "@/components/layout/app-logo";
import { ResizeContainer } from "@/components/ui/resize-container";

function isRestrictedBrowser(): { restricted: boolean; browserName: string } {
  if (typeof window === "undefined") return { restricted: false, browserName: "" };

  const ua = navigator.userAgent || "";

  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window.navigator as any).standalone === true;

  if (isStandalone) return { restricted: true, browserName: "this app" };

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

function getLastMagicLinkRequest(email: string): number | null {
  if (typeof window === "undefined") return null;
  const key = `signup_magic_link_last_${email.toLowerCase().trim()}`;
  const stored = localStorage.getItem(key);
  return stored ? parseInt(stored, 10) : null;
}

function setLastMagicLinkRequest(email: string): void {
  if (typeof window === "undefined") return;
  const key = `signup_magic_link_last_${email.toLowerCase().trim()}`;
  localStorage.setItem(key, Date.now().toString());
}

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isMagicLinkLoading, setIsMagicLinkLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
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

  function validateNameFields(): boolean {
    if (!firstName.trim() || !lastName.trim()) {
      toast.error("Please enter your first and last name");
      return false;
    }
    return true;
  }

  async function handleMagicLinkSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!validateNameFields()) return;

    setIsMagicLinkLoading(true);

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      toast.error("Please enter your email address");
      setIsMagicLinkLoading(false);
      return;
    }

    const lastRequest = getLastMagicLinkRequest(trimmedEmail);
    if (lastRequest && Date.now() - lastRequest < 60000) {
      const secondsRemaining = Math.ceil((60000 - (Date.now() - lastRequest)) / 1000);
      toast.error(`Please wait ${secondsRemaining} seconds before requesting another link`);
      setIsMagicLinkLoading(false);
      return;
    }

    const fullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: trimmedEmail,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/confirm?type=magiclink`,
          shouldCreateUser: true,
          data: {
            full_name: fullName,
            first_name: firstName.trim(),
            last_name: lastName.trim(),
          },
        },
      });

      if (error) {
        const errorInfo = parseAuthError(error.message);
        if (errorInfo.isRateLimit || errorInfo.isEmailDelivery) {
          toast.error(errorInfo.title, {
            description: errorInfo.action || errorInfo.message,
            duration: 8000,
          });
        } else if (errorInfo.title === "Email Already Registered") {
          toast.error(errorInfo.title, {
            description: errorInfo.action || errorInfo.message,
            duration: 8000,
          });
        } else {
          toast.error("Unable to send sign-up link. Try password sign-up or Google instead.");
        }
        return;
      }

      setLastMagicLinkRequest(trimmedEmail);
      setMagicLinkSent(true);
      Analytics.signUp("email");
      toast.success("Sign-up link sent! Check your inbox to verify your email.");
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setIsMagicLinkLoading(false);
    }
  }

  async function handleEmailSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!validateNameFields()) return;

    setIsLoading(true);

    try {
      const fullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/confirm?type=signup`,
          data: {
            full_name: fullName,
            first_name: firstName.trim(),
            last_name: lastName.trim(),
          },
        },
      });

      if (signUpError) {
        const errorInfo = parseAuthError(signUpError.message);

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

      Analytics.signUp("email");
      toast.success("Account created! Check your email to verify before signing in.", {
        duration: 6000,
      });
      router.push("/login?email_verified=pending");
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleGoogleSignup() {
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
      } else {
        Analytics.signUp("google");
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

  const anyLoading = isLoading || isMagicLinkLoading || isGoogleLoading;

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

      <ResizeContainer className="flex flex-col gap-4">
        {restrictedBrowser.restricted && (
          <Card className="border-yellow-400 dark:border-yellow-600/50 bg-yellow-50 dark:bg-yellow-900/20">
            <CardContent className="py-3 px-4">
              <div className="flex items-center gap-3">
                <ExternalLink className="size-4 text-yellow-600 dark:text-yellow-400 shrink-0" />
                <p className="text-sm font-medium text-yellow-700 dark:text-yellow-300 flex-1">
                  Open in Safari or Chrome for full features
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyUrl}
                  className="shrink-0 h-7 px-2.5 text-xs border-yellow-500 dark:border-yellow-600 text-yellow-700 dark:text-yellow-300 hover:bg-yellow-100 dark:hover:bg-yellow-900/40"
                >
                  {copied ? (
                    <Check className="size-3.5 text-green-600 dark:text-green-400" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                  {copied ? "Copied!" : "Copy URL"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="overflow-hidden">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl">Create an account</CardTitle>
            <CardDescription>
              Sign up with a magic link, Google, phone, or password
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                className="w-full"
                onClick={handleGoogleSignup}
                disabled={anyLoading || restrictedBrowser.restricted}
                aria-label="Sign up with Google"
              >
                {isGoogleLoading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <svg className="size-4" viewBox="0 0 24 24" aria-hidden="true">
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
                <span className="ml-2">Google</span>
              </Button>

              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push("/phone-login")}
                disabled={anyLoading}
                aria-label="Sign up with phone"
              >
                <Smartphone className="size-4" />
                <span className="ml-2">Phone</span>
              </Button>
            </div>

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

            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">
                Verify your email first
              </p>
              <p className="text-sm text-muted-foreground">
                Trial credits start once you confirm your inbox.{" "}
                <span className="font-semibold text-foreground">.mil</span>{" "}
                addresses like{" "}
                <span className="font-semibold text-foreground">us.af.mil</span>{" "}
                won&apos;t get our emails yet. Those networks block us for now, so
                use a personal email you can actually check.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  placeholder="John"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  disabled={anyLoading}
                  aria-label="First name"
                  autoComplete="given-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  placeholder="Doe"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  disabled={anyLoading}
                  aria-label="Last name"
                  autoComplete="family-name"
                />
              </div>
            </div>

            <Tabs defaultValue="magic-link" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="magic-link" className="gap-1.5">
                  <Mail className="size-3.5" />
                  Email link
                </TabsTrigger>
                <TabsTrigger value="password" className="gap-1.5">
                  <KeyRound className="size-3.5" />
                  Password
                </TabsTrigger>
              </TabsList>

              <TabsContent value="magic-link" className="mt-4 space-y-4 focus-visible:outline-none">
                {magicLinkSent ? (
                  <div className="space-y-4" key="signup-magic-sent">
                    <div className="flex items-center justify-center p-6 rounded-lg bg-primary/10 border border-primary/20">
                      <Mail className="size-12 text-primary" />
                    </div>
                    <div className="text-center space-y-2">
                      <p className="text-sm text-muted-foreground">
                        We sent a sign-up link to:
                      </p>
                      <p className="font-medium">{email}</p>
                      <p className="text-sm text-muted-foreground mt-4">
                        Click the link to verify your email and activate your account.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => {
                        setMagicLinkSent(false);
                        setEmail("");
                      }}
                    >
                      Use a different email
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={handleMagicLinkSignup} className="space-y-4" key="signup-magic-form">
                    <div className="space-y-2">
                      <Label htmlFor="magic-email">Email</Label>
                      <Input
                        id="magic-email"
                        type="email"
                        placeholder="you@personal-email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        disabled={isMagicLinkLoading}
                        aria-label="Email address for sign-up link"
                        autoComplete="email"
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={anyLoading}>
                      {isMagicLinkLoading ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        "Send sign-up link"
                      )}
                    </Button>
                  </form>
                )}
              </TabsContent>

              <TabsContent value="password" className="mt-4 focus-visible:outline-none">
                <form onSubmit={handleEmailSignup} className="space-y-4" key="signup-password-form">
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
                      autoComplete="new-password"
                    />
                    <p className="text-xs text-muted-foreground">
                      Minimum 8 characters
                    </p>
                  </div>
                  <Button type="submit" className="w-full" disabled={anyLoading}>
                    {isLoading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      "Create account"
                    )}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
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
      </ResizeContainer>
    </div>
  );
}
