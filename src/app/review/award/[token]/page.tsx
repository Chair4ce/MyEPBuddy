"use client";

import { use } from "react";
import { GenericReviewPage } from "@/components/review/generic-review-page";

export default function AwardReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const resolvedParams = use(params);
  
  return (
    <GenericReviewPage 
      token={resolvedParams.token} 
      shellType="award" 
      shellTypeLabel="Award Package" 
    />
  );
}
