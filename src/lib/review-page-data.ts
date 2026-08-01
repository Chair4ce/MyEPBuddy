import type { CommentData } from "@/components/review/comment-card";

export interface ReviewSection {
  key: string;
  label: string;
  content: string;
}

export interface ReviewData {
  shellType: string;
  shellId: string;
  rateeName: string;
  rateeRank?: string;
  linkLabel?: string | null;
  isAnonymous: boolean;
  title?: string;
  cycleYear?: number;
  dutyDescription?: string;
  sections: ReviewSection[] | null;
}

export type ReviewStep = "loading" | "error" | "name" | "review" | "submitting" | "success";

export interface StoredProgress {
  reviewerName: string;
  reviewerNameSource: "label" | "provided" | "generated";
  comments: CommentData[];
  step: ReviewStep;
}

export interface ReviewPageLoadResult {
  reviewData: ReviewData;
  initialStep: ReviewStep;
  initialReviewerName: string;
  initialReviewerNameSource: StoredProgress["reviewerNameSource"];
  initialComments: CommentData[];
  error: string | null;
}

const getStorageKey = (token: string) => `review_progress_${token}`;

const reviewLoadCache = new Map<string, Promise<ReviewPageLoadResult>>();

export function loadReviewPageData(token: string): Promise<ReviewPageLoadResult> {
  const cached = reviewLoadCache.get(token);
  if (cached) return cached;

  const promise = (async (): Promise<ReviewPageLoadResult> => {
    try {
      const response = await fetch(`/api/review/${token}`);
      const data = await response.json();

      if (!response.ok) {
        return {
          reviewData: null as unknown as ReviewData,
          initialStep: "error",
          initialReviewerName: "",
          initialReviewerNameSource: "provided",
          initialComments: [],
          error: data.error || "Failed to load review data",
        };
      }

      const normalizedSections: ReviewSection[] = [];

      if (data.shellType === "epb" && data.sections) {
        for (const section of data.sections) {
          normalizedSections.push({
            key: section.mpa,
            label:
              {
                executing_mission: "Executing the Mission",
                leading_people: "Leading People",
                managing_resources: "Managing Resources",
                improving_unit: "Improving the Unit",
                hlr_assessment: "HLR Assessment",
              }[section.mpa as string] || section.mpa,
            content: section.statement_text || "",
          });
        }
      } else if (data.sections) {
        for (const section of data.sections) {
          normalizedSections.push({
            key: section.key,
            label: section.label,
            content: section.content || "",
          });
        }
      }

      const reviewData: ReviewData = {
        ...data,
        sections: normalizedSections,
      };

      let initialStep: ReviewStep = "name";
      let initialReviewerName = "";
      let initialReviewerNameSource: StoredProgress["reviewerNameSource"] = "provided";
      let initialComments: CommentData[] = [];

      try {
        const savedProgress = localStorage.getItem(getStorageKey(token));
        if (savedProgress) {
          const progress: StoredProgress = JSON.parse(savedProgress);
          if (progress.reviewerName) {
            initialReviewerName = progress.reviewerName;
            initialReviewerNameSource = progress.reviewerNameSource;
          }
          if (progress.comments && progress.comments.length > 0) {
            initialComments = progress.comments;
          }
          if (progress.reviewerName && progress.step === "review") {
            initialStep = "review";
          }
        }
      } catch (e) {
        console.warn("Failed to restore review progress:", e);
      }

      return {
        reviewData,
        initialStep,
        initialReviewerName,
        initialReviewerNameSource,
        initialComments,
        error: null,
      };
    } catch (err) {
      console.error("Load error:", err);
      return {
        reviewData: null as unknown as ReviewData,
        initialStep: "error",
        initialReviewerName: "",
        initialReviewerNameSource: "provided",
        initialComments: [],
        error: "Failed to load review data",
      };
    }
  })();

  reviewLoadCache.set(token, promise);
  return promise;
}

export { getStorageKey };
