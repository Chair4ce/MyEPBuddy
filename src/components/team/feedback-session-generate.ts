import { toast } from "@/components/ui/sonner";
import type { FeedbackType } from "@/types/database";

export const GENERATE_BUTTON_LABELS: Record<FeedbackType, string> = {
  initial: "Draft from expectations",
  midterm: "Generate midterm talking points",
  final: "Generate final session notes",
};

export const GENERATE_HELPER_TEXT: Record<FeedbackType, string> = {
  initial: "Uses saved expectations and the ACA rubric for this rank.",
  midterm:
    "Uses expectations, assessed accomplishments, and cycle quality signals. Edit before sharing.",
  final:
    "Uses expectations, assessed accomplishments, and cycle quality signals. Edit before sharing.",
};

export function getGenerateAriaLabel(
  feedbackType: FeedbackType,
  memberName: string
): string {
  return `${GENERATE_BUTTON_LABELS[feedbackType]} for ${memberName}`;
}

export interface TalkingPointsRequestBody {
  feedbackType: FeedbackType;
  subordinateId: string | null;
  teamMemberId: string | null;
  cycleYear: number;
}

export function buildTalkingPointsRequestBody(
  params: TalkingPointsRequestBody
): TalkingPointsRequestBody {
  return params;
}

export interface TalkingPointsGeneratePayload {
  draftText: string;
  reviewedAccomplishmentIds?: string[];
  warnings?: string[];
}

export function applyTalkingPointsWarnings(warnings: string[] | undefined): void {
  if (warnings?.includes("epb_statements_unavailable")) {
    toast.warning(
      "EPB statements were unavailable — draft uses accomplishments only."
    );
  }

  if (warnings?.includes("accomplishments_truncated")) {
    toast.warning(
      "Draft used the 200 most recent accomplishments; older entries were omitted."
    );
  }
}
