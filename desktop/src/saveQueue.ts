export interface SaveSnapshot<T> {
  draft: T | null;
  dirty: boolean;
  saving: boolean;
  error: unknown | null;
  revision: number;
}

interface SaveQueueOptions<T> {
  save: (draft: T) => Promise<T>;
  /** Merge native-assigned metadata only, never old content over a newer draft. */
  reconcile?: (saved: T, latest: T) => T;
  onSaved?: (saved: T) => void;
}

/**
 * One writer per vault session. Immutable drafts, monotonically increasing
 * revisions, and an epoch prevent a late result from populating a new/locked
 * editor. flush() drains every revision, including edits during an active save.
 * Errors retain the dirty draft and reject all callers; retry is explicit.
 */
export class SaveQueue<T> {
  private draft: T | null = null;
  private lastSaved: T | null = null;
  private revision = 0;
  private savedRevision = 0;
  private epoch = 0;
  private error: unknown | null = null;
  private running: Promise<void> | null = null;
  private listeners = new Set<(snapshot: SaveSnapshot<T>) => void>();

  constructor(private readonly options: SaveQueueOptions<T>) {}

  snapshot(): SaveSnapshot<T> {
    return { draft: this.draft, dirty: this.revision > this.savedRevision, saving: this.running !== null, error: this.error, revision: this.revision };
  }

  subscribe(listener: (snapshot: SaveSnapshot<T>) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => { this.listeners.delete(listener); };
  }

  private emit() { for (const listener of this.listeners) listener(this.snapshot()); }

  /** Load only after awaiting flush. clear() is reserved for invalidation/teardown. */
  load(draft: T | null): void {
    if (this.running) throw new Error("Cannot switch drafts during a save.");
    this.epoch++;
    this.draft = draft;
    this.lastSaved = draft;
    this.revision = this.savedRevision = 0;
    this.error = null;
    this.emit();
  }

  update(draft: T): void {
    if (this.draft === null) throw new Error("No note is selected.");
    this.draft = draft;
    this.revision++;
    this.error = null;
    this.emit();
  }

  discard(): void {
    if (this.running) throw new Error("Wait for the current save before discarding.");
    this.load(this.lastSaved);
  }

  /** Invalidates callbacks, not a native write already in progress. */
  clear(): void {
    this.epoch++;
    this.draft = this.lastSaved = null;
    this.revision = this.savedRevision = 0;
    this.error = null;
    this.emit();
  }

  async flush(): Promise<void> {
    if (this.running) {
      await this.running;
      // A caller may have changed the epoch or added an edit as the prior job ended.
      return this.flush();
    }
    if (this.draft === null || this.revision <= this.savedRevision) return;
    const epoch = this.epoch;
    const drain = async () => {
      while (epoch === this.epoch && this.draft !== null && this.revision > this.savedRevision) {
        const revision = this.revision;
        const snapshot = this.draft;
        try {
          const saved = await this.options.save(snapshot);
          if (epoch !== this.epoch) return;
          this.savedRevision = revision;
          this.lastSaved = saved;
          this.draft = this.revision === revision ? saved : (this.options.reconcile?.(saved, this.draft!) ?? this.draft);
          this.error = null;
          this.options.onSaved?.(saved);
          this.emit();
        } catch (error) {
          if (epoch !== this.epoch) return;
          this.error = error;
          this.emit();
          throw error;
        }
      }
    };
    // Assign the promise before invoking save, including synchronously throwing adapters.
    this.running = Promise.resolve().then(drain);
    this.emit();
    try { await this.running; }
    finally { this.running = null; this.emit(); }
  }
}
