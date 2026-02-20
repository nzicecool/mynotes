import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 1,
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
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Create a note first
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
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Create a note first
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
});

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
