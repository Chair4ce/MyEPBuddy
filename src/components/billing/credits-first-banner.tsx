import { Coins } from "lucide-react";
import { cn } from "@/lib/utils";

const FREE_MODEL_NAME = "Gemini 2.5 Flash Lite";

interface CreditsFirstBannerProps {
  /** Remaining free credit balance. */
  balance: number;
  className?: string;
  /** Compact variant for tight spaces (e.g. inside the model picker). */
  compact?: boolean;
}

/**
 * Explains the "use free credits first" state: the free app model is being used
 * to spend remaining credits, after which the user's own-key model takes over.
 */
export function CreditsFirstBanner({
  balance,
  className,
  compact = false,
}: CreditsFirstBannerProps) {
  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200",
        compact ? "p-2.5 text-xs" : "p-3 text-sm",
        className,
      )}
    >
      <Coins
        className={cn("shrink-0 mt-0.5", compact ? "size-3.5" : "size-4")}
        aria-hidden="true"
      />
      <div className="space-y-1">
        <p className="leading-relaxed">
          Using your free tokens ({FREE_MODEL_NAME}) —{" "}
          <span className="font-semibold tabular-nums">{balance}</span>{" "}
          {balance === 1 ? "token" : "tokens"} left. Your own model takes over
          automatically when they run out.
        </p>
        {!compact ? (
          <p className="leading-relaxed text-amber-800/90 dark:text-amber-300/80">
            Results come from the free {FREE_MODEL_NAME} model right now — not
            the model on the API key you added — so quality may be lower until
            your tokens run out. Turn off{" "}
            <span className="font-medium">&ldquo;Use free tokens first&rdquo;</span>{" "}
            in{" "}
            <a
              href="/settings/billing"
              className="underline underline-offset-2 hover:opacity-80"
            >
              AI Tokens
            </a>{" "}
            to use your own model now.
          </p>
        ) : null}
      </div>
    </div>
  );
}
