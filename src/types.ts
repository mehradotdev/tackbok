import type { Entry, Tag, EntryTag, Asset, Mood, NewEntry, NewTag } from './db/schema';

// Re-export schema types for convenience
export type { Entry, Tag, EntryTag, Asset, Mood, NewEntry, NewTag };

// Extended entry for UI display (timeline items)
export interface EntryListItem extends Entry {
  isLast?: boolean;
  placeholderText?: string;
}

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
