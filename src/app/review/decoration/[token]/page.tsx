"use client";

import { use } from "react";
import { GenericReviewPage } from "@/components/review/generic-review-page";

export default function DecorationReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const resolvedParams = use(params);
  
  return (
    <GenericReviewPage 
      token={resolvedParams.token} 
      shellType="decoration" 
      shellTypeLabel="Decoration" 
    />
  );
}
