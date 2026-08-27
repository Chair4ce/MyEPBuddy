import type { Metadata } from "next";
import Link from "next/link";
import { AppLogo } from "@/components/layout/app-logo";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  motionEnter,
  motionEnterDurNormal,
} from "@/lib/motion/classes";
import {
  confirmContinueCopy,
  parseEmailOtpType,
  parseTokenHash,
} from "@/lib/auth/email-otp";
import { safeAppNextPath } from "@/lib/managed-member-invite-params";
import { ConfirmContinueForm } from "./confirm-continue-form";
import { EmailOtpCodeForm } from "@/components/auth/email-otp-code-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Confirm your email",
  robots: { index: false, follow: false },
};

interface ConfirmPageProps {
  searchParams: Promise<{
    token_hash?: string;
    type?: string;
    next?: string;
    error?: string;
  }>;
}

function loginCodeHref(type: string | null): string {
  if (type === "recovery") return "/forgot-password";
  if (type === "signup") return "/login?email_verified=pending";
  return "/login";
}

export default async function ConfirmPage({ searchParams }: ConfirmPageProps) {
  const params = await searchParams;
  const tokenHash = parseTokenHash(params.token_hash);
  const type = parseEmailOtpType(params.type);
  const next = safeAppNextPath(params.next, "https://www.myepbuddy.com");
  const expired = params.error === "expired";
  const copy = type ? confirmContinueCopy(type) : null;

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-background via-background to-primary/5">
      <div className="w-full flex justify-center py-3 border-b bg-background/80 backdrop-blur">
        <span className="px-3 py-1 text-xs font-semibold tracking-wider rounded bg-green-600 text-white dark:bg-green-700 dark:text-green-50 select-none">
          UNCLASSIFIED
        </span>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center relative px-4">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent pointer-events-none" />
        <div
          className={cn(
            "relative z-10 w-full max-w-md",
            motionEnter,
            motionEnterDurNormal
          )}
        >
          <div className="text-center mb-8">
            <div className="flex justify-center mb-3">
              <AppLogo size="xl" variant="stacked" />
            </div>
          </div>
          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-2xl">
                {copy?.title ?? "Invalid verification link"}
              </CardTitle>
              <CardDescription>
                {expired
                  ? "This link is invalid, expired, or was already opened — often by an email scanner or isolated web gateway (for example Air Force Menlo). Enter the code from the email instead."
                  : copy?.body ??
                    "This confirmation link is missing required information."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {tokenHash && type && copy && !expired ? (
                <ConfirmContinueForm
                  tokenHash={tokenHash}
                  type={type}
                  next={next}
                  submitLabel={copy.submit}
                />
              ) : null}
              {type ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium">
                    Government or isolated browser?
                  </p>
                  <EmailOtpCodeForm
                    type={type}
                    nextPath={next}
                    submitLabel="Continue with code"
                    idPrefix="confirm-otp"
                  />
                </div>
              ) : null}
              <p className="text-sm text-muted-foreground">
                On a government network, open MyEPBuddy yourself and type the
                code from the email. Do not rely on this page if a security
                proxy opened it for you.
              </p>
            </CardContent>
            <CardFooter>
              <p className="text-sm text-muted-foreground w-full text-center">
                <Link
                  href={loginCodeHref(type)}
                  className="text-primary hover:underline"
                >
                  Enter a code instead
                </Link>
              </p>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}
