import type { Entry, Tag, NewEntry, NewTag } from './db/schema';

// Asset type for photos/audio stored in entries
export type Asset = {
  type: 'IMAGE' | 'AUDIO';
  uri: string;
};

// Mood (defined in constants.ts alongside MOOD_EMOJI / MOOD_OPTIONS)
export type { Mood } from './constants';

// Re-export schema types for convenience
export type { Entry, Tag, NewEntry, NewTag };

/** First day of week options */
export type FirstDayOfWeek = 'saturday' | 'sunday' | 'monday';

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
