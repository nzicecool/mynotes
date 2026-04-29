/**
 * db.ts — Dual-driver database module
 *
 * Selects the database driver at startup based on DATABASE_DRIVER env var:
 *   DATABASE_DRIVER=sqlite  → better-sqlite3 + drizzle-orm/better-sqlite3
 *   DATABASE_DRIVER=mysql   → mysql2 + drizzle-orm/mysql2  (default)
 *
 * SQLite is recommended for Raspberry Pi / single-user / air-gapped deployments.
 * MySQL is recommended for multi-user / server / team deployments.
 *
 * SQLite database file location is controlled by SQLITE_PATH (default: ./data/mynotes.db)
 */

import { and, eq, gt, desc } from "drizzle-orm";

// ─── Driver type union ────────────────────────────────────────────────────────

type AnyDb =
  | ReturnType<typeof import("drizzle-orm/mysql2").drizzle>
  | ReturnType<typeof import("drizzle-orm/better-sqlite3").drizzle>;

let _db: AnyDb | null = null;
let _driver: "mysql" | "sqlite" | null = null;

function getDriver(): "mysql" | "sqlite" {
  const d = (process.env.DATABASE_DRIVER ?? "mysql").toLowerCase();
  return d === "sqlite" ? "sqlite" : "mysql";
}

// ─── Lazy initialisation ──────────────────────────────────────────────────────

export async function getDb(): Promise<AnyDb | null> {
  if (_db) return _db;

  _driver = getDriver();

  if (_driver === "sqlite") {
    try {
      const BetterSqlite3 = (await import("better-sqlite3")).default;
      const { drizzle } = await import("drizzle-orm/better-sqlite3");
      const path = await import("path");
      const fs = await import("fs");

      const dbPath = process.env.SQLITE_PATH ?? "./data/mynotes.db";
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const sqlite = new BetterSqlite3(dbPath);
      // Enable WAL mode for better concurrent read performance
      sqlite.pragma("journal_mode = WAL");
      sqlite.pragma("foreign_keys = ON");

      _db = drizzle(sqlite) as AnyDb;
      console.log(`[Database] SQLite connected: ${dbPath}`);
    } catch (err) {
      console.error("[Database] SQLite init failed:", err);
      _db = null;
    }
  } else {
    if (!process.env.DATABASE_URL) return null;
    try {
      const { drizzle } = await import("drizzle-orm/mysql2");
      _db = drizzle(process.env.DATABASE_URL) as AnyDb;
      console.log("[Database] MySQL connected");
    } catch (err) {
      console.warn("[Database] MySQL init failed:", err);
      _db = null;
    }
  }

  return _db;
}

// ─── Schema imports (driver-aware) ────────────────────────────────────────────

async function getSchema() {
  if (getDriver() === "sqlite") {
    return import("../drizzle/schema.sqlite");
  }
  return import("../drizzle/schema");
}

// ─── SQLite-safe upsert helpers ───────────────────────────────────────────────

/**
 * For SQLite we cannot use onDuplicateKeyUpdate (MySQL-only).
 * We use INSERT OR REPLACE instead via a raw approach, or check-then-insert/update.
 */
async function sqliteUpsert(
  db: AnyDb,
  table: any,
  whereClause: any,
  insertValues: any,
  updateValues: any
) {
  const existing = await (db as any).select().from(table).where(whereClause).limit(1);
  if (existing.length > 0) {
    await (db as any).update(table).set({ ...updateValues, updatedAt: new Date() }).where(whereClause);
  } else {
    await (db as any).insert(table).values(insertValues);
  }
}

// ─── User helpers ─────────────────────────────────────────────────────────────

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const { users } = await getSchema();
  const result = await (db as any).select().from(users).where(eq(users.email, email)).limit(1);
  return result[0];
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const { users } = await getSchema();
  const result = await (db as any).select().from(users).where(eq(users.id, id)).limit(1);
  return result[0];
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const { users } = await getSchema();
  const result = await (db as any).select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function createLocalUser(data: {
  name: string;
  email: string;
  passwordHash: string;
  role?: "user" | "admin";
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { users } = await getSchema();
  const result = await (db as any).insert(users).values({
    name: data.name,
    email: data.email,
    passwordHash: data.passwordHash,
    loginMethod: "local",
    role: data.role ?? "user",
    lastSignedIn: new Date(),
  });
  return result;
}

export async function updateUserPassword(userId: number, passwordHash: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { users } = await getSchema();
  await (db as any).update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, userId));
}

/** Legacy upsert kept for OAuth compatibility */
export async function upsertUser(user: any): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const { users } = await getSchema();
  const updateSet: Record<string, unknown> = {};
  for (const field of ["name", "email", "loginMethod"] as const) {
    if (user[field] !== undefined) updateSet[field] = user[field] ?? null;
  }
  if (user.lastSignedIn) updateSet.lastSignedIn = user.lastSignedIn;
  if (user.role) updateSet.role = user.role;
  updateSet.updatedAt = new Date();

  if (getDriver() === "sqlite") {
    await sqliteUpsert(
      db,
      users,
      eq(users.openId, user.openId),
      { ...user, lastSignedIn: user.lastSignedIn ?? new Date() },
      updateSet
    );
  } else {
    await (db as any).insert(users).values({ ...user, lastSignedIn: user.lastSignedIn ?? new Date() })
      .onDuplicateKeyUpdate({ set: updateSet });
  }
}

// ─── Notes helpers ────────────────────────────────────────────────────────────

export async function getNotesByUserId(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const { notes } = await getSchema();
  return (db as any).select().from(notes).where(and(eq(notes.userId, userId), eq(notes.isTrashed, 0)));
}

export async function getNoteById(noteId: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const { notes } = await getSchema();
  const result = await (db as any).select().from(notes)
    .where(and(eq(notes.id, noteId), eq(notes.userId, userId))).limit(1);
  return result[0];
}

export async function createNote(note: {
  userId: number;
  title?: string;
  encryptedContent: string;
  noteType: "plain" | "rich" | "markdown" | "checklist" | "code" | "spreadsheet";
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { notes } = await getSchema();
  return (db as any).insert(notes).values(note);
}

export async function updateNote(
  noteId: number,
  userId: number,
  updates: { title?: string; encryptedContent?: string; isPinned?: number; isArchived?: number; isTrashed?: number }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { notes } = await getSchema();
  await (db as any).update(notes)
    .set({ ...updates, updatedAt: new Date() })
    .where(and(eq(notes.id, noteId), eq(notes.userId, userId)));
}

export async function deleteNote(noteId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { notes } = await getSchema();
  await (db as any).delete(notes).where(and(eq(notes.id, noteId), eq(notes.userId, userId)));
}

// ─── Tags helpers ─────────────────────────────────────────────────────────────

export async function getTagsByUserId(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const { tags } = await getSchema();
  return (db as any).select().from(tags).where(eq(tags.userId, userId));
}

export async function createTag(tag: { userId: number; name: string; color?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { tags } = await getSchema();
  return (db as any).insert(tags).values(tag);
}

// ─── Folders helpers ──────────────────────────────────────────────────────────

export async function getFoldersByUserId(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const { folders } = await getSchema();
  return (db as any).select().from(folders).where(eq(folders.userId, userId));
}

export async function createFolder(folder: { userId: number; name: string; parentId?: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { folders } = await getSchema();
  return (db as any).insert(folders).values(folder);
}

// ─── Revisions helpers ────────────────────────────────────────────────────────

export async function getRevisionsByNoteId(noteId: number) {
  const db = await getDb();
  if (!db) return [];
  const { revisions } = await getSchema();
  return (db as any).select().from(revisions)
    .where(eq(revisions.noteId, noteId))
    .orderBy(desc(revisions.createdAt));
}

export async function createRevision(revision: { noteId: number; encryptedContent: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { revisions } = await getSchema();
  return (db as any).insert(revisions).values(revision);
}

// ─── User settings helpers ────────────────────────────────────────────────────

export async function getUserSettings(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const { userSettings } = await getSchema();
  const result = await (db as any).select().from(userSettings)
    .where(eq(userSettings.userId, userId)).limit(1);
  return result[0];
}

export async function upsertUserSettings(settings: {
  userId: number;
  saltForKeyDerivation?: string;
  twoFactorEnabled?: number;
  twoFactorSecret?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { userSettings } = await getSchema();

  if (getDriver() === "sqlite") {
    await sqliteUpsert(
      db,
      userSettings,
      eq(userSettings.userId, settings.userId),
      { ...settings, updatedAt: new Date() },
      { ...settings, updatedAt: new Date() }
    );
  } else {
    await (db as any).insert(userSettings).values(settings)
      .onDuplicateKeyUpdate({ set: settings });
  }
}

// ─── Password reset token helpers ─────────────────────────────────────────────

export async function createPasswordResetToken(userId: number, tokenHash: string, expiresAt: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { passwordResetTokens } = await getSchema();
  await (db as any).delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
  await (db as any).insert(passwordResetTokens).values({ userId, tokenHash, expiresAt });
}

export async function getValidResetTokenByUserId(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const { passwordResetTokens } = await getSchema();
  const now = new Date();
  const result = await (db as any).select().from(passwordResetTokens)
    .where(and(eq(passwordResetTokens.userId, userId), gt(passwordResetTokens.expiresAt, now)))
    .limit(1);
  return result[0];
}

export async function deleteResetTokensByUserId(userId: number) {
  const db = await getDb();
  if (!db) return;
  const { passwordResetTokens } = await getSchema();
  await (db as any).delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
}

// ─── Note-Tag association helpers ───────────────────────────────────────────

export async function addTagToNote(noteId: number, tagId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { noteTags } = await getSchema();
  // Avoid duplicates
  const existing = await (db as any).select().from(noteTags)
    .where(and(eq(noteTags.noteId, noteId), eq(noteTags.tagId, tagId))).limit(1);
  if (existing.length === 0) {
    await (db as any).insert(noteTags).values({ noteId, tagId });
  }
}

export async function removeTagFromNote(noteId: number, tagId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { noteTags } = await getSchema();
  await (db as any).delete(noteTags).where(and(eq(noteTags.noteId, noteId), eq(noteTags.tagId, tagId)));
}

export async function getTagsForNote(noteId: number) {
  const db = await getDb();
  if (!db) return [];
  const { noteTags, tags } = await getSchema();
  return (db as any).select({ id: tags.id, name: tags.name, color: tags.color })
    .from(noteTags)
    .innerJoin(tags, eq(noteTags.tagId, tags.id))
    .where(eq(noteTags.noteId, noteId));
}

export async function getNoteIdsByTagId(tagId: number) {
  const db = await getDb();
  if (!db) return [];
  const { noteTags } = await getSchema();
  const rows = await (db as any).select({ noteId: noteTags.noteId }).from(noteTags).where(eq(noteTags.tagId, tagId));
  return rows.map((r: { noteId: number }) => r.noteId);
}

export async function deleteTag(tagId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { tags, noteTags } = await getSchema();
  // Remove all note-tag associations first
  await (db as any).delete(noteTags).where(eq(noteTags.tagId, tagId));
  // Delete the tag itself (scoped to owner)
  await (db as any).delete(tags).where(and(eq(tags.id, tagId), eq(tags.userId, userId)));
}

// ─── SQLite migration helper ──────────────────────────────────────────────────

/**
 * For SQLite, drizzle-kit push is not available at runtime.
 * This function creates all tables if they do not exist, using raw SQL.
 * Called automatically on server startup when DATABASE_DRIVER=sqlite.
 */
export async function initSqliteSchema() {
  if (getDriver() !== "sqlite") return;
  const db = await getDb();
  if (!db) return;

  const sqlite = (db as any).session?.client ?? (db as any).$client;
  if (!sqlite) return;

  const tables = [
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      openId TEXT UNIQUE,
      name TEXT,
      email TEXT UNIQUE,
      passwordHash TEXT,
      loginMethod TEXT DEFAULT 'local',
      role TEXT NOT NULL DEFAULT 'user',
      createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
      updatedAt INTEGER NOT NULL DEFAULT (unixepoch()),
      lastSignedIn INTEGER NOT NULL DEFAULT (unixepoch())
    )`,
    `CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      title TEXT,
      encryptedContent TEXT NOT NULL,
      noteType TEXT NOT NULL DEFAULT 'plain',
      isPinned INTEGER NOT NULL DEFAULT 0,
      isArchived INTEGER NOT NULL DEFAULT 0,
      isTrashed INTEGER NOT NULL DEFAULT 0,
      createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
      updatedAt INTEGER NOT NULL DEFAULT (unixepoch())
    )`,
    `CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      name TEXT NOT NULL,
      color TEXT,
      createdAt INTEGER NOT NULL DEFAULT (unixepoch())
    )`,
    `CREATE TABLE IF NOT EXISTS folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      name TEXT NOT NULL,
      parentId INTEGER,
      createdAt INTEGER NOT NULL DEFAULT (unixepoch())
    )`,
    `CREATE TABLE IF NOT EXISTS noteTags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      noteId INTEGER NOT NULL,
      tagId INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS noteFolders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      noteId INTEGER NOT NULL,
      folderId INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS revisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      noteId INTEGER NOT NULL,
      encryptedContent TEXT NOT NULL,
      createdAt INTEGER NOT NULL DEFAULT (unixepoch())
    )`,
    `CREATE TABLE IF NOT EXISTS userSettings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL UNIQUE,
      encryptedMasterKey TEXT,
      saltForKeyDerivation TEXT,
      twoFactorEnabled INTEGER NOT NULL DEFAULT 0,
      twoFactorSecret TEXT,
      updatedAt INTEGER NOT NULL DEFAULT (unixepoch())
    )`,
    `CREATE TABLE IF NOT EXISTS passwordResetTokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      tokenHash TEXT NOT NULL,
      expiresAt INTEGER NOT NULL,
      createdAt INTEGER NOT NULL DEFAULT (unixepoch())
    )`,
  ];

  for (const sql of tables) {
    sqlite.exec(sql);
  }

  console.log("[Database] SQLite schema initialised");
}
