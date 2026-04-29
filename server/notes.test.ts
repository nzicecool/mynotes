/**
 * Integration tests for notes, tags, and folders tRPC routers.
 * Uses an in-memory SQLite database initialised with the full schema before each suite.
 */
import { describe, expect, it, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { initSqliteSchema } from "./db";

// ─── Test context factory ─────────────────────────────────────────────────────

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(userId = 1): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: userId,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };

  return { ctx };
}

// ─── Ensure SQLite schema is initialised before any test runs ─────────────────

beforeAll(async () => {
  await initSqliteSchema();
});

// ─── Notes router ─────────────────────────────────────────────────────────────

describe("notes router", () => {
  it("should create a note", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.notes.create({
      title: "Test Note",
      encryptedContent: "encrypted_test_content",
      noteType: "plain",
    });

    expect(result).toBeDefined();
  });

  it("should list notes for authenticated user", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const notes = await caller.notes.list();

    expect(Array.isArray(notes)).toBe(true);
  });

  it("should update a note", async () => {
    const { ctx } = createAuthContext(2);
    const caller = appRouter.createCaller(ctx);

    await caller.notes.create({
      title: "Original Title",
      encryptedContent: "original_content",
      noteType: "plain",
    });

    const notes = await caller.notes.list();
    const noteId = notes[0]?.id;

    if (noteId) {
      const result = await caller.notes.update({
        id: noteId,
        title: "Updated Title",
        encryptedContent: "updated_content",
      });

      expect(result.success).toBe(true);
    }
  });

  it("should delete a note", async () => {
    const { ctx } = createAuthContext(3);
    const caller = appRouter.createCaller(ctx);

    await caller.notes.create({
      title: "To Delete",
      encryptedContent: "content_to_delete",
      noteType: "plain",
    });

    const notes = await caller.notes.list();
    const noteId = notes[0]?.id;

    if (noteId) {
      const result = await caller.notes.delete({ id: noteId });
      expect(result.success).toBe(true);
    }
  });
});

// ─── Tags router ──────────────────────────────────────────────────────────────

describe("tags router", () => {
  it("should create a tag", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.tags.create({
      name: "Test Tag",
      color: "#FF0000",
    });

    expect(result).toBeDefined();
  });

  it("should list tags for authenticated user", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const tags = await caller.tags.list();

    expect(Array.isArray(tags)).toBe(true);
  });

  it("should add and remove a tag from a note", async () => {
    const { ctx } = createAuthContext(10);
    const caller = appRouter.createCaller(ctx);

    // Create a note and a tag
    await caller.notes.create({ title: "Tagged Note", encryptedContent: "enc", noteType: "plain" });
    const notes = await caller.notes.list();
    const noteId = notes[0]?.id;
    expect(noteId).toBeDefined();

    await caller.tags.create({ name: "MyTag", color: "#00FF00" });
    const tags = await caller.tags.list();
    const tagId = tags[0]?.id;
    expect(tagId).toBeDefined();

    // Add tag to note
    const addResult = await caller.tags.addToNote({ noteId: noteId!, tagId: tagId! });
    expect(addResult.success).toBe(true);

    // Fetch tags for note
    const noteTags = await caller.tags.getForNote({ noteId: noteId! });
    expect(noteTags.some((t: { id: number }) => t.id === tagId)).toBe(true);

    // Remove tag from note
    const removeResult = await caller.tags.removeFromNote({ noteId: noteId!, tagId: tagId! });
    expect(removeResult.success).toBe(true);

    const noteTagsAfter = await caller.tags.getForNote({ noteId: noteId! });
    expect(noteTagsAfter.some((t: { id: number }) => t.id === tagId)).toBe(false);
  });

  it("should delete a tag", async () => {
    const { ctx } = createAuthContext(11);
    const caller = appRouter.createCaller(ctx);

    await caller.tags.create({ name: "DeleteMe", color: "#AABBCC" });
    const tags = await caller.tags.list();
    const tagId = tags[0]?.id;
    expect(tagId).toBeDefined();

    const result = await caller.tags.delete({ id: tagId! });
    expect(result.success).toBe(true);

    const tagsAfter = await caller.tags.list();
    expect(tagsAfter.some((t: { id: number }) => t.id === tagId)).toBe(false);
  });
});

// ─── Folders router ───────────────────────────────────────────────────────────

describe("folders router", () => {
  it("should create a folder", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.folders.create({
      name: "Test Folder",
    });

    expect(result).toBeDefined();
  });

  it("should list folders for authenticated user", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const folders = await caller.folders.list();

    expect(Array.isArray(folders)).toBe(true);
  });
});
