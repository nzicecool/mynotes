import { describe, expect, it, vi } from "vitest";
import { SaveQueue } from "./saveQueue";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };
type Draft = { id: string; text: string; updatedAt: number };
const draft = (text: string): Draft => ({ id: "note-a", text, updatedAt: 1 });

describe("SaveQueue", () => {
  it("saves nothing for a clean note", async () => {
    const save = vi.fn(async (value: Draft) => value);
    const queue = new SaveQueue({ save });
    queue.load(draft("original")); await queue.flush();
    expect(save).not.toHaveBeenCalled();
    expect(queue.snapshot().dirty).toBe(false);
  });
  it("serializes parallel flush callers and drains edits made during a save", async () => {
    const first = deferred<Draft>(); const second = deferred<Draft>();
    const save = vi.fn().mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);
    const onSaved = vi.fn();
    const queue = new SaveQueue<Draft>({ save, reconcile: (saved, latest) => ({ ...latest, updatedAt: saved.updatedAt }), onSaved });
    queue.load(draft("original")); queue.update(draft("one"));
    const flushOne = queue.flush(); const flushTwo = queue.flush();
    await tick(); expect(save).toHaveBeenCalledTimes(1);
    queue.update(draft("two"));
    first.resolve({ ...draft("one"), updatedAt: 2 }); await tick();
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][0]).toEqual({ ...draft("two"), updatedAt: 2 });
    expect(queue.snapshot().draft?.text).toBe("two");
    second.resolve({ ...draft("two"), updatedAt: 3 });
    await Promise.all([flushOne, flushTwo]);
    expect(queue.snapshot()).toMatchObject({ dirty: false, saving: false, error: null, draft: { text: "two", updatedAt: 3 } });
    expect(onSaved).toHaveBeenCalledTimes(2);
  });
  it("retains failed dirty edits, rejects flush, and permits explicit retry", async () => {
    const error = new Error("disk full");
    const save = vi.fn().mockRejectedValueOnce(error).mockImplementationOnce(async value => value);
    const queue = new SaveQueue<Draft>({ save });
    queue.load(draft("original")); queue.update(draft("unsaved"));
    await expect(queue.flush()).rejects.toThrow("disk full");
    expect(queue.snapshot()).toMatchObject({ dirty: true, saving: false, error, draft: { text: "unsaved" } });
    await queue.flush();
    expect(queue.snapshot()).toMatchObject({ dirty: false, error: null });
  });
  it("rejects every concurrent caller on failure without parallel writes", async () => {
    const pending = deferred<Draft>();
    const save = vi.fn(() => pending.promise);
    const queue = new SaveQueue({ save });
    queue.load(draft("original")); queue.update(draft("edit"));
    const first = queue.flush(); const second = queue.flush();
    const settled = Promise.allSettled([first, second]);
    await tick(); pending.reject(new Error("write denied"));
    expect((await settled).map(result => result.status)).toEqual(["rejected", "rejected"]);
    expect(save).toHaveBeenCalledTimes(1);
  });
  it("does not let an invalidated late result repopulate locked plaintext state", async () => {
    const pending = deferred<Draft>(); const onSaved = vi.fn();
    const queue = new SaveQueue<Draft>({ save: () => pending.promise, onSaved });
    queue.load(draft("original")); queue.update(draft("edit"));
    const flush = queue.flush(); await tick(); queue.clear();
    pending.resolve(draft("edit")); await flush;
    expect(queue.snapshot()).toMatchObject({ draft: null, dirty: false, saving: false });
    expect(onSaved).not.toHaveBeenCalled();
  });
  it("does not switch or discard during an in-flight save", async () => {
    const pending = deferred<Draft>();
    const queue = new SaveQueue<Draft>({ save: () => pending.promise });
    queue.load(draft("original")); queue.update(draft("edit"));
    const flush = queue.flush(); await tick();
    expect(() => queue.load({ ...draft("other"), id: "note-b" })).toThrow("Cannot switch");
    expect(() => queue.discard()).toThrow("Wait");
    pending.resolve(draft("edit")); await flush;
    queue.load({ ...draft("other"), id: "note-b" });
    expect(queue.snapshot().draft?.id).toBe("note-b");
  });
  it("explicit discard returns to the last successful revision, not an older load", async () => {
    const save = vi.fn().mockImplementationOnce(async value => value).mockRejectedValueOnce(new Error("failed"));
    const queue = new SaveQueue<Draft>({ save });
    queue.load(draft("original")); queue.update(draft("saved")); await queue.flush();
    queue.update(draft("unsaved")); await expect(queue.flush()).rejects.toThrow();
    queue.discard();
    expect(queue.snapshot()).toMatchObject({ draft: { text: "saved" }, dirty: false, error: null });
  });
  it("catches synchronously throwing adapters and allows later retry", async () => {
    const save = vi.fn().mockImplementationOnce(() => { throw new Error("sync"); }).mockImplementationOnce(async value => value);
    const queue = new SaveQueue<Draft>({ save });
    queue.load(draft("original")); queue.update(draft("edit"));
    await expect(queue.flush()).rejects.toThrow("sync");
    expect(queue.snapshot().saving).toBe(false);
    await queue.flush(); expect(queue.snapshot().dirty).toBe(false);
  });
});
