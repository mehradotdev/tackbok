import type { Entry, Tag, NewEntry, NewTag } from './db/schema';

// Asset types — using `as const` (works with Expo's isolatedModules / Babel)
export const AssetType = {
  IMAGE: 'IMAGE',
  AUDIO: 'AUDIO',
} as const;

export type AssetTypeValue = (typeof AssetType)[keyof typeof AssetType];

// Asset type for photos/audio stored in entries
export type Asset = {
  type: AssetTypeValue;
  uri: string;
  /** Pixel width of the image (may be absent for legacy entries) */
  width?: number;
  /** Pixel height of the image (may be absent for legacy entries) */
  height?: number;
};

// Mood (defined in constants.ts alongside MOOD_EMOJI / MOOD_OPTIONS)
export type { Mood } from './constants';

// Re-export schema types for convenience
export type { Entry, Tag, NewEntry, NewTag };

/** First day of week options — using `as const` for a single source of truth */
export const FirstDay = {
  SATURDAY: 'saturday',
  SUNDAY: 'sunday',
  MONDAY: 'monday',
} as const;

export type FirstDayOfWeek = (typeof FirstDay)[keyof typeof FirstDay];

// Milestone item for timeline display
export interface MilestoneItem {
  type: 'milestone';
  milestoneDays: number;
  isLast?: boolean;
}

// Day group for grouped timeline
export interface DayGroup {
  dateMs: number; // Start of day timestamp
  dateStr: string; // YYYY-MM-DD format
  entries: Entry[];
  isExpanded: boolean;
  isToday?: boolean;
  isYesterday?: boolean;
  placeholderText?: string;
  isLast?: boolean;
}

// Union type for timeline items (now includes day groups and milestones)
export type TimelineListItem = DayGroup | MilestoneItem;
