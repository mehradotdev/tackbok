import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import type { Asset, Mood } from '~/types';

// ============================================================================
// Tables
// ============================================================================

/**
 * Core journal entries table.
 * - Primary Key: UUID (note_id)
 * - Assets: Stored as a JSON column (denormalized)
 * - Mood: One of 5 constant values
 * - Nullable Fields: Title, Content, Mood, and Assets are all optional; only Timestamp is required
 */
export const entries = sqliteTable(
  'entries',
  {
    note_id: text('note_id').primaryKey().notNull(),
    text_title: text('text_title'),
    text_content: text('text_content'),
    mood: text('mood').$type<Mood>(),
    assets: text('assets', { mode: 'json' }).$type<Asset[]>(),
    tags: text('tags').notNull().default(''),
    created_at: integer('created_at').notNull(),
    updated_at: integer('updated_at').notNull(),
  },
  (table) => [index('entries_created_at_idx').on(table.created_at)],
);

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

/**
 * User-created reusable journal title prompts.
 * Built-in prompts remain static translation keys in code; only custom prompts live in DB.
 */
export const customPrompts = sqliteTable('custom_prompts', {
  prompt_id: text('prompt_id').primaryKey().notNull(),
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
export type CustomPrompt = typeof customPrompts.$inferSelect;
export type NewCustomPrompt = typeof customPrompts.$inferInsert;
