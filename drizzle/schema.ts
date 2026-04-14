import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table — local email/password authentication.
 * No external OAuth dependency; suitable for fully self-hosted deployments.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  /** Used by legacy Manus OAuth path — kept for migration compatibility, nullable for local auth */
  openId: varchar("openId", { length: 64 }).unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }).unique(),
  /** bcrypt hash of the user's password (null for OAuth-only accounts) */
  passwordHash: varchar("passwordHash", { length: 255 }),
  loginMethod: varchar("loginMethod", { length: 64 }).default("local"),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Notes table - stores encrypted note content and metadata
 */
export const notes = mysqlTable("notes", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  title: text("title"),
  encryptedContent: text("encryptedContent").notNull(),
  noteType: mysqlEnum("noteType", ["plain", "rich", "markdown", "checklist", "code", "spreadsheet"]).default("plain").notNull(),
  isPinned: int("isPinned").default(0).notNull(),
  isArchived: int("isArchived").default(0).notNull(),
  isTrashed: int("isTrashed").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Note = typeof notes.$inferSelect;
export type InsertNote = typeof notes.$inferInsert;

/**
 * Tags table - for organizing notes
 */
export const tags = mysqlTable("tags", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  color: varchar("color", { length: 7 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Tag = typeof tags.$inferSelect;
export type InsertTag = typeof tags.$inferInsert;

/**
 * Folders table - nested folder structure
 */
export const folders = mysqlTable("folders", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  parentId: int("parentId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Folder = typeof folders.$inferSelect;
export type InsertFolder = typeof folders.$inferInsert;

/**
 * Note-Tag relationships (many-to-many)
 */
export const noteTags = mysqlTable("noteTags", {
  id: int("id").autoincrement().primaryKey(),
  noteId: int("noteId").notNull(),
  tagId: int("tagId").notNull(),
});

export type NoteTag = typeof noteTags.$inferSelect;
export type InsertNoteTag = typeof noteTags.$inferInsert;

/**
 * Note-Folder relationships
 */
export const noteFolders = mysqlTable("noteFolders", {
  id: int("id").autoincrement().primaryKey(),
  noteId: int("noteId").notNull(),
  folderId: int("folderId").notNull(),
});

export type NoteFolder = typeof noteFolders.$inferSelect;
export type InsertNoteFolder = typeof noteFolders.$inferInsert;

/**
 * Revisions table - stores previous versions of notes
 */
export const revisions = mysqlTable("revisions", {
  id: int("id").autoincrement().primaryKey(),
  noteId: int("noteId").notNull(),
  encryptedContent: text("encryptedContent").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Revision = typeof revisions.$inferSelect;
export type InsertRevision = typeof revisions.$inferInsert;

/**
 * User settings table
 */
export const userSettings = mysqlTable("userSettings", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  encryptedMasterKey: text("encryptedMasterKey"),
  saltForKeyDerivation: varchar("saltForKeyDerivation", { length: 64 }),
  twoFactorEnabled: int("twoFactorEnabled").default(0).notNull(),
  twoFactorSecret: varchar("twoFactorSecret", { length: 64 }),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type UserSettings = typeof userSettings.$inferSelect;
export type InsertUserSettings = typeof userSettings.$inferInsert;

/**
 * Password reset tokens — single-use, time-limited tokens for the forgot-password flow.
 * Each token is a cryptographically random hex string stored as a bcrypt hash.
 * Tokens expire after 1 hour and are deleted on use.
 */
export const passwordResetTokens = mysqlTable("passwordResetTokens", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  /** bcrypt hash of the raw token (never store raw tokens) */
  tokenHash: varchar("tokenHash", { length: 255 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type InsertPasswordResetToken = typeof passwordResetTokens.$inferInsert;