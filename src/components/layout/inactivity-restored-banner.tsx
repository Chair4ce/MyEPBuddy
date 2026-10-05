"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { motionEnterFade } from "@/lib/motion/classes";
import { cn } from "@/lib/utils";

/**
 * Shown once after middleware restores a suspended account.
 * The query flag is the signal — no effect, no timer.
 */
export function InactivityRestoredBanner() {
  const params = useSearchParams();
  const pathname = usePathname();
  if (params.get("accountRestored") !== "1") return null;

  const next = new URLSearchParams(params.toString());
  next.delete("accountRestored");
  const query = next.toString();
  const href = query ? `${pathname}?${query}` : pathname;

  return (
    <div
      role="status"
      className={cn(
        "flex shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-border bg-card px-4 py-2 text-center text-sm text-foreground",
        motionEnterFade
      )}
    >
      <p>
        Welcome back. Your account is active again, and your saved work and AI credits are still here.
      </p>
      <Link
        href={href}
        className="text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Dismiss
      </Link>
    </div>
  );
}
