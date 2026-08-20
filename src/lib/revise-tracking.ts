import type { TokenTrackingContext } from "@/lib/ai-models/token-usage";
import type { PhraseReviseMode } from "@/lib/word-thesaurus";

/** Token-usage action for expand / compress / rephrase (credits still use revise_selection). */
export type ReviseTrackingAction =
  | "revise_expand"
  | "revise_compress"
  | "revise_rephrase";

export function reviseTrackingAction(
  mode: PhraseReviseMode | string | undefined,
): ReviseTrackingAction {
  if (mode === "expand") return "revise_expand";
  if (mode === "compress") return "revise_compress";
  return "revise_rephrase";
}

export function withTrackingAction(
  tracking: TokenTrackingContext | undefined,
  action: string,
): TokenTrackingContext | undefined {
  if (!tracking) return tracking;
  return { ...tracking, action };
}
