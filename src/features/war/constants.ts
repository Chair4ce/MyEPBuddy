/**
 * Constants for WAR (Weekly Activity Report) feature
 */

import type { WARCategory, WARCategoryConfig } from './types';

export const WAR_CATEGORIES: WARCategoryConfig[] = [
  {
    key: 'mission_impact',
    label: 'Mission Impact',
    description: 'Direct mission accomplishments, operational tempo, readiness metrics',
    icon: '🎯',
  },
  {
    key: 'training_readiness',
    label: 'Training & Readiness',
    description: 'PME completion, certifications, exercises, TDYs, upgrade training',
    icon: '📚',
  },
  {
    key: 'recognition_awards',
    label: 'Recognition & Awards',
    description: 'Quarterly awards, decorations, coins, kudos, promotions',
    icon: '🏆',
  },
  {
    key: 'leadership_mentorship',
    label: 'Leadership & Mentorship',
    description: 'Troop development, mentoring activities, professional development',
    icon: '👥',
  },
  {
    key: 'programs_initiatives',
    label: 'Programs & Initiatives',
    description: 'Additional duties, unit programs, process improvements',
    icon: '📋',
  },
  {
    key: 'community_involvement',
    label: 'Community Involvement',
    description: 'Volunteer work, base events, outreach activities',
    icon: '🤝',
  },
  {
    key: 'challenges_concerns',
    label: 'Challenges & Concerns',
    description: 'Issues requiring leadership awareness, manning, resources',
    icon: '⚠️',
  },
  {
    key: 'upcoming_events',
    label: 'Upcoming Events',
    description: 'Look-ahead items, scheduled events, milestones',
    icon: '📅',
  },
  {
    key: 'other',
    label: 'Other',
    description: 'Items that don\'t fit other categories',
    icon: '📝',
  },
];

export const WAR_CATEGORY_MAP: Record<WARCategory, WARCategoryConfig> = 
  WAR_CATEGORIES.reduce((acc, cat) => {
    acc[cat.key] = cat;
    return acc;
  }, {} as Record<WARCategory, WARCategoryConfig>);

export const DEFAULT_WAR_TITLE_FORMAT = (start: Date, end: Date) => {
  const formatter = new Intl.DateTimeFormat('en-US', { 
    month: 'short', 
    day: 'numeric' 
  });
  return `Weekly Activity Report: ${formatter.format(start)} - ${formatter.format(end)}`;
};

/**
 * Keywords that suggest a category for auto-categorization
 * Used as hints before sending to AI for final categorization
 */
export const CATEGORY_KEYWORDS: Record<WARCategory, string[]> = {
  mission_impact: [
    'mission', 'sortie', 'operation', 'deployed', 'combat', 'operational',
    'readiness', 'inspection', 'exercise', 'alert', 'real-world',
  ],
  training_readiness: [
    'training', 'PME', 'EPME', 'ALS', 'NCOA', 'SNCOA', 'certification',
    'qualified', 'upgrade', 'course', 'school', 'TDY', 'exercise',
  ],
  recognition_awards: [
    'award', 'recognition', 'coin', 'quarterly', 'annual', 'medal',
    'decoration', 'promoted', 'selected', 'BTZ', 'honor', 'excellence',
  ],
  leadership_mentorship: [
    'mentor', 'mentee', 'troop', 'development', 'counseling', 'feedback',
    'EPR', 'OPR', 'leadership', 'supervise', 'coach', 'guide',
  ],
  programs_initiatives: [
    'program', 'initiative', 'additional duty', 'SAPR', 'SARC', 'UDM',
    'safety', 'booster club', 'committee', 'process improvement',
  ],
  community_involvement: [
    'volunteer', 'community', 'charity', 'donation', 'event', 'outreach',
    'AADD', 'Top 3', 'Rising 6', 'First Sergeant', 'council',
  ],
  challenges_concerns: [
    'challenge', 'concern', 'issue', 'problem', 'manning', 'shortage',
    'delay', 'obstacle', 'risk', 'attention',
  ],
  upcoming_events: [
    'upcoming', 'scheduled', 'planned', 'next week', 'future', 'calendar',
    'deadline', 'due date', 'milestone',
  ],
  other: [],
};

/**
 * Default date range is current week (Monday - Sunday)
 */
export function getDefaultWARDateRange(): { start: Date; end: Date } {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  monday.setHours(0, 0, 0, 0);
  
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  
  return { start: monday, end: sunday };
}
