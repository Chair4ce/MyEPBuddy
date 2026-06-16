"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface LegalHeaderActionsProps {
  isAuthenticated: boolean;
}

export function LegalHeaderActions({ isAuthenticated }: LegalHeaderActionsProps) {
  const router = useRouter();

  if (isAuthenticated) {
    return (
      <Button
        variant="ghost"
        onClick={() => router.back()}
        aria-label="Go back to previous page"
      >
        <ArrowLeft className="size-4 mr-2" aria-hidden="true" />
        Go back
      </Button>
    );
  }

  return (
    <>
      <Button variant="ghost" asChild>
        <Link href="/login">Sign In</Link>
      </Button>
      <Button asChild>
        <Link href="/signup">Get Started</Link>
      </Button>
    </>
  );
}
