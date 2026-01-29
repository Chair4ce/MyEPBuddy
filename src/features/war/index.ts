/**
 * WAR (Weekly Activity Report) Feature
 * 
 * Enables supervisors to compile team accomplishments into
 * formatted reports and share them up the chain of command.
 */

// Types
export type {
  WARStatus,
  WARCategory,
  WARCategoryConfig,
  WARAccomplishment,
  WARContent,
  WARReport,
  WARShare,
  AccomplishmentStar,
  CreateWARRequest,
  UpdateWARRequest,
  ShareWARRequest,
  WARListParams,
  StarredAccomplishmentsParams,
} from './types';

// Constants
export {
  WAR_CATEGORIES,
  WAR_CATEGORY_MAP,
  DEFAULT_WAR_TITLE_FORMAT,
  CATEGORY_KEYWORDS,
  getDefaultWARDateRange,
} from './constants';
