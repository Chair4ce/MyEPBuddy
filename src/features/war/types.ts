/**
 * TypeScript types for WAR (Weekly Activity Report) feature
 */

export type WARStatus = 'draft' | 'published' | 'archived';

export type WARCategory =
  | 'mission_impact'
  | 'training_readiness'
  | 'recognition_awards'
  | 'leadership_mentorship'
  | 'programs_initiatives'
  | 'community_involvement'
  | 'challenges_concerns'
  | 'upcoming_events'
  | 'other';

export interface WARCategoryConfig {
  key: WARCategory;
  label: string;
  description: string;
  icon?: string;
}

export interface WARAccomplishment {
  accomplishmentId: string;
  category: WARCategory;
  displayOrder: number;
  // Denormalized for display
  content?: string;
  rateeName?: string;
  rateeRank?: string;
}

export interface WARContent {
  summary?: string;
  categories: {
    [key in WARCategory]?: WARAccomplishment[];
  };
  notes?: string;
}

export interface WARReport {
  id: string;
  createdBy: string;
  title: string;
  dateRangeStart: string;
  dateRangeEnd: string;
  content: WARContent;
  status: WARStatus;
  createdAt: string;
  updatedAt: string;
  // Joined data
  createdByProfile?: {
    id: string;
    rank: string;
    firstName: string;
    lastName: string;
  };
}

export interface WARShare {
  id: string;
  warId: string;
  sharedWith: string;
  sharedBy: string;
  readAt: string | null;
  sharedAt: string;
  // Joined data
  war?: WARReport;
  sharedByProfile?: {
    id: string;
    rank: string;
    firstName: string;
    lastName: string;
  };
}

export interface AccomplishmentStar {
  id: string;
  userId: string;
  accomplishmentId: string;
  starredAt: string;
}

// API Request/Response types

export interface CreateWARRequest {
  title: string;
  dateRangeStart: string;
  dateRangeEnd: string;
  accomplishmentIds: string[];
  categories?: { [accomplishmentId: string]: WARCategory };
}

export interface UpdateWARRequest {
  title?: string;
  content?: Partial<WARContent>;
  status?: WARStatus;
}

export interface ShareWARRequest {
  userIds: string[];
  shareUpChain?: boolean;
}

export interface WARListParams {
  status?: WARStatus | 'all';
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export interface StarredAccomplishmentsParams {
  from?: string;
  to?: string;
  rateeId?: string;
}
