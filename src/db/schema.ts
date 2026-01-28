import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// ============================================================================
// Types
// ============================================================================

// Asset type for photos/audio stored in entries
export type Asset = {
  type: 'IMAGE' | 'AUDIO';
  uri: string;
};

// Mood options
export type Mood = 'RAD' | 'GOOD' | 'MEH' | 'BAD' | 'AWFUL';

// ============================================================================
// Tables
// ============================================================================

/**
 * Core journal entries table.
 * - Primary Key: UUID (note_id)
 * - Assets: Stored as a JSON column (denormalized)
 * - Mood: One of 5 constant values
 * - Nullable Fields: Title, Content, Mood, and Assets are all optional
 */
export const entries = sqliteTable('entries', {
  note_id: text('note_id').primaryKey().notNull(),
  text_title: text('text_title'),
  text_content: text('text_content').notNull(),
  mood: text('mood').$type<Mood>(),
  assets: text('assets', { mode: 'json' }).$type<Asset[]>(),
  tags: text('tags').notNull().default(''),
  created_at: integer('created_at').notNull(),
  updated_at: integer('updated_at').notNull(),
});

/**
 * Global tags table.
 * Allows for renaming tags application-wide.
 */
export const tags = sqliteTable('tags', {
  tag_id: text('tag_id').primaryKey().notNull(),
  title: text('title').notNull().unique(),
  created_at: integer('created_at').notNull(),
  updated_at: integer('updated_at').notNull(),
});

// ============================================================================
// Inferred Types
// ============================================================================

export type Entry = typeof entries.$inferSelect;
export type NewEntry = typeof entries.$inferInsert;
export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;
