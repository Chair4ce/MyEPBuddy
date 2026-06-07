import Link from "next/link";
import { Suspense } from "react";
import { AppLogo } from "@/components/layout/app-logo";
import { AccountDeletedSurvey } from "@/components/settings/account-deleted-survey";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CheckCircle2 } from "lucide-react";

interface AccountDeletedPageProps {
  searchParams: Promise<{ survey?: string }>;
}

function AccountDeletedSurveySection({ surveyToken }: { surveyToken: string | null }) {
  return <AccountDeletedSurvey surveyToken={surveyToken} />;
}

export default async function AccountDeletedPage({
  searchParams,
}: AccountDeletedPageProps) {
  const params = await searchParams;
  const surveyToken =
    typeof params.survey === "string" && params.survey.length > 0
      ? params.survey
      : null;

  return (
    <div className="space-y-6">
      <div className="flex justify-center">
        <AppLogo />
      </div>

      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
            <CheckCircle2
              className="size-7 text-green-600 dark:text-green-400"
              aria-hidden="true"
            />
          </div>
          <CardTitle>Account deleted</CardTitle>
          <CardDescription>
            Your account and all associated data have been permanently removed.
            You have been signed out.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground text-center">
            Thank you for using MyEPBuddy. We&apos;re sad to see you go, and we
            hope our paths cross again someday.
          </p>

          <Suspense fallback={null}>
            <AccountDeletedSurveySection surveyToken={surveyToken} />
          </Suspense>
        </CardContent>

        <CardFooter className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link href="/">Return home</Link>
          </Button>
          <Button asChild className="w-full sm:w-auto">
            <Link href="/signup">Create a new account</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
