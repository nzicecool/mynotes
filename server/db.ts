import { and, eq, gt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

/** Look up a user by email address (for local auth) */
export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result[0];
}

/** Look up a user by numeric id */
export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0];
}

/** Create a new local-auth user with a bcrypt password hash */
export async function createLocalUser(data: { name: string; email: string; passwordHash: string; role?: "user" | "admin" }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(users).values({
    name: data.name,
    email: data.email,
    passwordHash: data.passwordHash,
    loginMethod: "local",
    role: data.role ?? "user",
    lastSignedIn: new Date(),
  });
  return result;
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

/**
 * Notes queries
 */
export async function getNotesByUserId(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const { notes } = await import("../drizzle/schema");
  const { eq, and } = await import("drizzle-orm");
  return db.select().from(notes).where(and(eq(notes.userId, userId), eq(notes.isTrashed, 0)));
}

export async function getNoteById(noteId: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const { notes } = await import("../drizzle/schema");
  const { eq, and } = await import("drizzle-orm");
  const result = await db.select().from(notes).where(and(eq(notes.id, noteId), eq(notes.userId, userId))).limit(1);
  return result[0];
}

export async function createNote(note: { userId: number; title?: string; encryptedContent: string; noteType: "plain" | "rich" | "markdown" | "checklist" | "code" | "spreadsheet" }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { notes } = await import("../drizzle/schema");
  const result = await db.insert(notes).values(note);
  return result;
}

export async function updateNote(noteId: number, userId: number, updates: { title?: string; encryptedContent?: string; isPinned?: number; isArchived?: number; isTrashed?: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { notes } = await import("../drizzle/schema");
  const { eq, and } = await import("drizzle-orm");
  await db.update(notes).set(updates).where(and(eq(notes.id, noteId), eq(notes.userId, userId)));
}

export async function deleteNote(noteId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { notes } = await import("../drizzle/schema");
  const { eq, and } = await import("drizzle-orm");
  await db.delete(notes).where(and(eq(notes.id, noteId), eq(notes.userId, userId)));
}

/**
 * Tags queries
 */
export async function getTagsByUserId(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const { tags } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  return db.select().from(tags).where(eq(tags.userId, userId));
}

export async function createTag(tag: { userId: number; name: string; color?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { tags } = await import("../drizzle/schema");
  const result = await db.insert(tags).values(tag);
  return result;
}

/**
 * Folders queries
 */
export async function getFoldersByUserId(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const { folders } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  return db.select().from(folders).where(eq(folders.userId, userId));
}

export async function createFolder(folder: { userId: number; name: string; parentId?: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { folders } = await import("../drizzle/schema");
  const result = await db.insert(folders).values(folder);
  return result;
}

/**
 * Revisions queries
 */
export async function getRevisionsByNoteId(noteId: number) {
  const db = await getDb();
  if (!db) return [];
  const { revisions } = await import("../drizzle/schema");
  const { eq, desc } = await import("drizzle-orm");
  return db.select().from(revisions).where(eq(revisions.noteId, noteId)).orderBy(desc(revisions.createdAt));
}

export async function createRevision(revision: { noteId: number; encryptedContent: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { revisions } = await import("../drizzle/schema");
  const result = await db.insert(revisions).values(revision);
  return result;
}

/**
 * User settings queries
 */
export async function getUserSettings(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const { userSettings } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  const result = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  return result[0];
}

export async function upsertUserSettings(settings: { userId: number; saltForKeyDerivation?: string; twoFactorEnabled?: number; twoFactorSecret?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { userSettings } = await import("../drizzle/schema");
  await db.insert(userSettings).values(settings).onDuplicateKeyUpdate({ set: settings });
}

/**
 * Password reset token queries
 */

/** Delete any existing tokens for the user, then insert a new one. */
export async function createPasswordResetToken(userId: number, tokenHash: string, expiresAt: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { passwordResetTokens } = await import("../drizzle/schema");
  // Invalidate previous tokens for this user
  await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
  await db.insert(passwordResetTokens).values({ userId, tokenHash, expiresAt });
}

/** Find a valid (non-expired) reset token record by userId. */
export async function getValidResetTokenByUserId(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const { passwordResetTokens } = await import("../drizzle/schema");
  const now = new Date();
  const result = await db
    .select()
    .from(passwordResetTokens)
    .where(and(eq(passwordResetTokens.userId, userId), gt(passwordResetTokens.expiresAt, now)))
    .limit(1);
  return result[0];
}

/** Delete all reset tokens for a user (called after successful reset). */
export async function deleteResetTokensByUserId(userId: number) {
  const db = await getDb();
  if (!db) return;
  const { passwordResetTokens } = await import("../drizzle/schema");
  await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
}

/** Update a user's password hash (used after successful reset). */
export async function updateUserPassword(userId: number, passwordHash: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
}
