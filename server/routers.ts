import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  notes: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const { getNotesByUserId } = await import("./db");
      return getNotesByUserId(ctx.user.id);
    }),
    get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
      const { getNoteById } = await import("./db");
      return getNoteById(input.id, ctx.user.id);
    }),
    create: protectedProcedure
      .input(z.object({
        title: z.string().optional(),
        encryptedContent: z.string(),
        noteType: z.enum(["plain", "rich", "markdown", "checklist", "code", "spreadsheet"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const { createNote } = await import("./db");
        return createNote({ ...input, userId: ctx.user.id });
      }),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().optional(),
        encryptedContent: z.string().optional(),
        isPinned: z.number().optional(),
        isArchived: z.number().optional(),
        isTrashed: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { updateNote, createRevision, getNoteById } = await import("./db");
        const { id, ...updates } = input;
        
        // Create revision before updating if content changed
        if (updates.encryptedContent) {
          const currentNote = await getNoteById(id, ctx.user.id);
          if (currentNote) {
            await createRevision({ noteId: id, encryptedContent: currentNote.encryptedContent });
          }
        }
        
        await updateNote(id, ctx.user.id, updates);
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { deleteNote } = await import("./db");
        await deleteNote(input.id, ctx.user.id);
        return { success: true };
      }),
    search: protectedProcedure
      .input(z.object({ query: z.string() }))
      .query(async ({ ctx, input }) => {
        const { getNotesByUserId } = await import("./db");
        const notes = await getNotesByUserId(ctx.user.id);
        // Note: Full-text search on encrypted content is not possible
        // Search is performed on titles only
        return notes.filter((note) =>
          note.title?.toLowerCase().includes(input.query.toLowerCase())
        );
      }),
  }),

  tags: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const { getTagsByUserId } = await import("./db");
      return getTagsByUserId(ctx.user.id);
    }),
    create: protectedProcedure
      .input(z.object({ name: z.string(), color: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const { createTag } = await import("./db");
        return createTag({ ...input, userId: ctx.user.id });
      }),
  }),

  folders: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const { getFoldersByUserId } = await import("./db");
      return getFoldersByUserId(ctx.user.id);
    }),
    create: protectedProcedure
      .input(z.object({ name: z.string(), parentId: z.number().optional() }))
      .mutation(async ({ ctx, input }) => {
        const { createFolder } = await import("./db");
        return createFolder({ ...input, userId: ctx.user.id });
      }),
  }),

  revisions: router({
    list: protectedProcedure
      .input(z.object({ noteId: z.number() }))
      .query(async ({ input }) => {
        const { getRevisionsByNoteId } = await import("./db");
        return getRevisionsByNoteId(input.noteId);
      }),
  }),

  settings: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      const { getUserSettings } = await import("./db");
      const settings = await getUserSettings(ctx.user.id);
      // Always return a non-undefined value — tRPC queries must not return undefined
      return settings ?? {
        id: null,
        userId: ctx.user.id,
        saltForKeyDerivation: null,
        twoFactorEnabled: 0,
        twoFactorSecret: null,
        createdAt: null,
        updatedAt: null,
      };
    }),
    updateSalt: protectedProcedure
      .input(z.object({ salt: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const { upsertUserSettings } = await import("./db");
        await upsertUserSettings({ userId: ctx.user.id, saltForKeyDerivation: input.salt });
        return { success: true };
      }),
    setup2FA: protectedProcedure
      .input(z.object({ secret: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const { upsertUserSettings } = await import("./db");
        await upsertUserSettings({ userId: ctx.user.id, twoFactorSecret: input.secret, twoFactorEnabled: 1 });
        return { success: true };
      }),
    disable2FA: protectedProcedure.mutation(async ({ ctx }) => {
      const { upsertUserSettings } = await import("./db");
      await upsertUserSettings({ userId: ctx.user.id, twoFactorEnabled: 0, twoFactorSecret: "" });
      return { success: true };
    }),
  }),

  // TODO: add feature routers here, e.g.
  // todo: router({
  //   list: protectedProcedure.query(({ ctx }) =>
  //     db.getUserTodos(ctx.user.id)
  //   ),
  // }),
});

export type AppRouter = typeof appRouter;
