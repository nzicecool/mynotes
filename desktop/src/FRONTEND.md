# MyNotes Desktop frontend

This entry is isolated from the web account dashboard. It imports the five existing editor components through `@`, plus a plain textarea. All persistence goes through `desktopApi` and native Tauri commands. Browser preview shows **Desktop runtime required**, never a demo vault. There are no account, network, localStorage, telemetry, or remote asset dependencies in this frontend. The fixed dark ThemeProvider does not use localStorage.

## Validation

From the repository root, with the parent-provided dependencies/configuration:

```bash
pnpm exec tsc -p desktop/tsconfig.json --noEmit
pnpm exec vitest run --config desktop/vitest.config.ts
pnpm exec vite build --config desktop/vite.config.ts
```

`helpers.test.ts` covers string PIN validation (including leading zeroes), tags, editor defaults, and title/body/tag search and mutually exclusive collection filters. `saveQueue.test.ts` covers serial writes, concurrent flush callers, newer drafts while saving, write failures/retry, explicit discard, synchronous adapter failures, transition fencing, and invalidated late results. They use the Node environment, not DOM test dependencies.

## Save and transition policy

`SaveQueue` stores immutable latest drafts and monotonically increasing revisions. Only one native note save runs at once. A native response updates saved metadata but cannot overwrite edits typed while that save was pending. Its epoch invalidates callbacks after lock/teardown. `flush()` drains every remaining revision and rejects on failure without losing the dirty draft.

The root App fences context-changing actions with a synchronous busy ref: note selection, creation, filters, flags, trash/delete, backup, lock and close await `flush()` first. Editor inputs remain responsive during ordinary autosave. Autosave starts after 1 second of draft inactivity; failures remain inline and are not endlessly retried. The shared checklist’s uncommitted add-item field is committed before a controlled transition so it is not silently dropped. Note types cannot be changed after creation. Search does not change the selected editor and therefore cannot discard its draft.

A failed transition displays Retry, Cancel and, for save failures, explicitly labeled **Discard unsaved edits & continue**. Discard restores the last successfully saved revision. Lock is never invoked before a successful flush or explicit discard. A failed native lock or close keeps the window open and displays an error.

## Lock and native close policy

Locking is **explicit only**: Lock vault, Ctrl/Cmd+L, or native window close. There is no blur lock or inactivity timer, so dialogs and native file choosers cannot inadvertently lock the vault. Use the operating system’s screen lock when away. Ctrl/Cmd+S flushes the current draft.

The root registers `getCurrentWindow().onCloseRequested`, calls `event.preventDefault()`, flushes changes, invokes `desktopApi.lock()`, clears notes/drafts/tags/search/codes and remount state, then invokes `getCurrentWindow().destroy()`. Listener registration errors are visibly reported. Native restart state must be locked; that invariant belongs to Rust, not frontend storage.

## Offline editor boundary

The shared Markdown editor in the inspected checkout uses a regex-generated HTML preview (not Streamdown). It is reused without modifying the shared source. A desktop-local wrapper strips non-formatting elements and attributes, disables link activation, and supplies accessible labels to shared editor controls. The native **CSP remains the security barrier** before/while HTML is inserted: remote image/media/connection loads and inline script/event execution must remain blocked. CSS hides embedded media as an additional display safeguard. Preview sanitization affects only the preview DOM, never stored Markdown. System fonts are used throughout.

## Native smoke checks still required

Exercise actual Tauri chooser cancellation, setup and five-code acknowledgement, unlock/recovery, code regeneration, PIN changes, all six editor formats, backups/restores with confirmed replacement, trash restore and permanent delete, and window-close behavior. In particular, inject native save failures (disk full/write denied) while typing and while locking/closing, then try each Retry/Cancel/Discard route. Verify restart starts locked and old backup recovery semantics match the warnings. Parent owns the native CSP, destroy capability, API bridge and configuration.
