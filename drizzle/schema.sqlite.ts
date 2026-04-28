/**
 * SQLite schema — mirrors schema.ts but uses drizzle-orm/sqlite-core types.
 * Used when DATABASE_DRIVER=sqlite (default for Raspberry Pi / single-user deployments).
 *
 * Key differences from MySQL schema:
 *  - integer() replaces int() for primary keys / foreign keys
 *  - text() with { enum: [...] } replaces mysqlEnum()
 *  - integer({ mode: "timestamp" }) replaces timestamp()
 *  - No .onUpdateNow() — SQLite does not support ON UPDATE triggers natively;
 *    updatedAt is set explicitly in db helpers instead.
 */
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  openId: text("openId").unique(),
  name: text("name"),
  email: text("email").unique(),
  passwordHash: text("passwordHash"),
  loginMethod: text("loginMethod").default("local"),
  role: text("role", { enum: ["user", "admin"] }).default("user").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
  lastSignedIn: integer("lastSignedIn", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const notes = sqliteTable("notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull(),
  title: text("title"),
  encryptedContent: text("encryptedContent").notNull(),
  noteType: text("noteType", { enum: ["plain", "rich", "markdown", "checklist", "code", "spreadsheet"] }).default("plain").notNull(),
  isPinned: integer("isPinned").default(0).notNull(),
  isArchived: integer("isArchived").default(0).notNull(),
  isTrashed: integer("isTrashed").default(0).notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
});

export type Note = typeof notes.$inferSelect;
export type InsertNote = typeof notes.$inferInsert;

export const tags = sqliteTable("tags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull(),
  name: text("name").notNull(),
  color: text("color"),
  createdAt: integer("createdAt", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
});

export type Tag = typeof tags.$inferSelect;
export type InsertTag = typeof tags.$inferInsert;

export const folders = sqliteTable("folders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull(),
  name: text("name").notNull(),
  parentId: integer("parentId"),
  createdAt: integer("createdAt", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
});

export type Folder = typeof folders.$inferSelect;
export type InsertFolder = typeof folders.$inferInsert;

export const noteTags = sqliteTable("noteTags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  noteId: integer("noteId").notNull(),
  tagId: integer("tagId").notNull(),
});

export type NoteTag = typeof noteTags.$inferSelect;
export type InsertNoteTag = typeof noteTags.$inferInsert;

export const noteFolders = sqliteTable("noteFolders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  noteId: integer("noteId").notNull(),
  folderId: integer("folderId").notNull(),
});

export type NoteFolder = typeof noteFolders.$inferSelect;
export type InsertNoteFolder = typeof noteFolders.$inferInsert;

export const revisions = sqliteTable("revisions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  noteId: integer("noteId").notNull(),
  encryptedContent: text("encryptedContent").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
});

export type Revision = typeof revisions.$inferSelect;
export type InsertRevision = typeof revisions.$inferInsert;

export const userSettings = sqliteTable("userSettings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull().unique(),
  encryptedMasterKey: text("encryptedMasterKey"),
  saltForKeyDerivation: text("saltForKeyDerivation"),
  twoFactorEnabled: integer("twoFactorEnabled").default(0).notNull(),
  twoFactorSecret: text("twoFactorSecret"),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
});

export type UserSettings = typeof userSettings.$inferSelect;
export type InsertUserSettings = typeof userSettings.$inferInsert;

export const passwordResetTokens = sqliteTable("passwordResetTokens", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull(),
  tokenHash: text("tokenHash").notNull(),
  expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
});

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type InsertPasswordResetToken = typeof passwordResetTokens.$inferInsert;
