"use client";

import { useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { toast } from "@/components/ui/sonner";
import { getExpectation } from "@/app/actions/supervisor-expectations";
import type { FeedbackType, SupervisorFeedback } from "@/types/database";
import {
  applyTalkingPointsWarnings,
  buildTalkingPointsRequestBody,
  type TalkingPointsGeneratePayload,
} from "./feedback-session-generate";

interface UseFeedbackTalkingPointsGenerateOptions {
  feedbackType: FeedbackType;
  subordinateId: string | null;
  teamMemberId: string | null;
  cycleYear: number;
  content: string;
  isShared: boolean;
  feedback: SupervisorFeedback | null;
  setContent: (content: string) => void;
  setFeedback: Dispatch<SetStateAction<SupervisorFeedback | null>>;
  reviewedAccomplishmentIdsRef: MutableRefObject<string[]>;
  setShowReplaceConfirm: (show: boolean) => void;
}

export function useFeedbackTalkingPointsGenerate({
  feedbackType,
  subordinateId,
  teamMemberId,
  cycleYear,
  content,
  isShared,
  feedback,
  setContent,
  setFeedback,
  reviewedAccomplishmentIdsRef,
  setShowReplaceConfirm,
}: UseFeedbackTalkingPointsGenerateOptions) {
  const [isGenerating, setIsGenerating] = useState(false);
  const generateRequestIdRef = useRef(0);

  async function executeGenerate() {
    if (!subordinateId && !teamMemberId) return;
    if (isGenerating) return;

    setShowReplaceConfirm(false);
    const requestId = ++generateRequestIdRef.current;
    setIsGenerating(true);

    try {
      if (feedbackType === "initial") {
        const { data: expectation } = await getExpectation(
          subordinateId,
          teamMemberId,
          cycleYear
        );
        if (requestId !== generateRequestIdRef.current) return;
        if (!expectation?.expectation_text?.trim()) {
          toast.warning(
            "No saved expectations yet — the draft will be rubric-generic. Set expectations first for a stronger session prep."
          );
        }
      }

      const response = await fetch("/api/generate-feedback-talking-points", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          buildTalkingPointsRequestBody({
            feedbackType,
            subordinateId,
            teamMemberId,
            cycleYear,
          })
        ),
      });

      if (requestId !== generateRequestIdRef.current) return;

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        toast.error(errorPayload.error || "Failed to generate talking points");
        return;
      }

      const payload = (await response.json()) as TalkingPointsGeneratePayload;
      if (requestId !== generateRequestIdRef.current) return;

      const reviewedIds = payload.reviewedAccomplishmentIds ?? [];
      setContent(payload.draftText);
      reviewedAccomplishmentIdsRef.current = reviewedIds;

      if (feedback) {
        setFeedback({
          ...feedback,
          reviewed_accomplishment_ids: reviewedIds,
        });
      }

      applyTalkingPointsWarnings(payload.warnings);
      toast.success("Talking points drafted — review and edit before sharing.");
    } catch (error) {
      if (requestId !== generateRequestIdRef.current) return;
      console.error("Generate talking points failed:", error);
      toast.error("Failed to generate talking points");
    } finally {
      if (requestId === generateRequestIdRef.current) {
        setIsGenerating(false);
      }
    }
  }

  function handleGenerateClick() {
    if (isShared || isGenerating) return;
    if (!subordinateId && !teamMemberId) {
      toast.error("Cannot generate talking points without a selected team member");
      return;
    }
    if (content.trim()) {
      setShowReplaceConfirm(true);
      return;
    }
    void executeGenerate();
  }

  return {
    isGenerating,
    handleGenerateClick,
    executeGenerate,
  };
}
