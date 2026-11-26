import { useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { AlertTriangle, LockKeyhole, RefreshCw } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { desktopApi } from "./api";
import type { DesktopNote, NoteType } from "./types";
import { initialContent, messageOf, parseTags, searchNotes, type NoteFilter } from "./helpers";
import { SaveQueue, type SaveSnapshot } from "./saveQueue";
import Dashboard, { NewNoteDialog } from "./Dashboard";
import { AccessScreen, CodesScreen, InlineError, RestoreDialog, SettingsDialog, VaultShell } from "./VaultScreens";

type Screen = "loading" | "error" | "runtime" | "setup" | "unlock" | "recover" | "codes" | "dashboard";
type Failure = { label: string; error: string; stage: "save" | "action"; action: () => Promise<void> };

export default function App() {
  const [screen, setScreen] = useState<Screen>("loading");
  const screenRef = useRef<Screen>("loading");
  const [notes, setNotes] = useState<DesktopNote[]>([]);
  const notesRef = useRef<DesktopNote[]>([]);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | undefined>();
  const [codes, setCodes] = useState<string[]>([]);
  const [freshCodes, setFreshCodes] = useState(false);
  const [filter, setFilter] = useState<NoteFilter>("all");
  const filterRef = useRef<NoteFilter>("all");
  const [query, setQuery] = useState("");
  const queryRef = useRef("");
  const [tagsEntry, setTagsEntry] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoreReplacement, setRestoreReplacement] = useState(false);
  const [restoreNotice, setRestoreNotice] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const failureRef = useRef<Failure | null>(null);
  const epoch = useRef(0);
  const pendingCommitRef = useRef<(() => void) | null>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [queue] = useState(() => new SaveQueue<DesktopNote>({
    save: draft => desktopApi.saveNote({ id: draft.id, title: draft.title, content: draft.content, noteType: draft.noteType, tags: draft.tags, pinned: draft.pinned, archived: draft.archived, trashed: draft.trashed }),
    reconcile: (saved, latest) => ({ ...latest, id: saved.id, createdAt: saved.createdAt, updatedAt: saved.updatedAt }),
    onSaved: saved => {
      const next = notesRef.current.some(note => note.id === saved.id) ? notesRef.current.map(note => note.id === saved.id ? saved : note) : [saved, ...notesRef.current];
      notesRef.current = next;
      setNotes(next);
    },
  }));
  const [snapshot, setSnapshot] = useState<SaveSnapshot<DesktopNote>>(() => queue.snapshot());
  useEffect(() => queue.subscribe(setSnapshot), [queue]);

  function go(next: Screen) { screenRef.current = next; setScreen(next); }
  function setWorking(value: boolean) { busyRef.current = value; setBusy(value); }
  function stopTimer() { if (autosaveTimer.current) clearTimeout(autosaveTimer.current); autosaveTimer.current = null; }
  function recordNotes(next: DesktopNote[]) { notesRef.current = next; setNotes(next); }
  function choose(note: DesktopNote | null) { queue.load(note); setTagsEntry(note?.tags.join(", ") || ""); }
  function wipePlaintext() {
    epoch.current++;
    stopTimer();
    queue.clear();
    recordNotes([]);
    setTagsEntry(""); setCodes([]); setQuery(""); queryRef.current = "";
    setFilter("all"); filterRef.current = "all";
    setSettingsOpen(false); setNewOpen(false); setRestoreOpen(false); setDeleteOpen(false);
    setError(null); setNotice(null); setRestoreNotice(null);
    failureRef.current = null; setFailure(null);
  }

  async function openDashboard() {
    const token = ++epoch.current;
    const loaded = await desktopApi.listNotes();
    if (token !== epoch.current) return;
    recordNotes(loaded);
    choose(searchNotes(loaded, "all", "")[0] || null);
    setCodes([]); setError(null);
    setFilter("all"); filterRef.current = "all";
    setQuery(""); queryRef.current = "";
    go("dashboard");
  }

  async function readStatus() {
    if (busyRef.current) return;
    setWorking(true); setError(null); go("loading");
    try {
      if (!isTauri()) { go("runtime"); return; }
      const status = await desktopApi.status();
      setRemaining(status.recoveryCodesRemaining);
      if (!status.initialized) go("setup");
      else if (status.unlocked) await openDashboard();
      else go("unlock");
    } catch (cause) { setError(messageOf(cause)); go("error"); }
    finally { setWorking(false); }
  }
  useEffect(() => { void readStatus(); return () => { stopTimer(); queue.clear(); }; }, []); // Native status is read once; corrupt state is never reset.

  function showCodes(next: string[], fresh: boolean) {
    wipePlaintext();
    setCodes(next); setFreshCodes(fresh); setRemaining(next.length); go("codes");
  }

  async function access(pin: string, code?: string) {
    if (busyRef.current) return;
    setWorking(true); setError(null);
    try {
      if (screenRef.current === "setup") showCodes((await desktopApi.setup(pin)).codes, false);
      else if (screenRef.current === "recover") showCodes((await desktopApi.recover(code || "", pin)).codes, true);
      else { await desktopApi.unlock(pin); await openDashboard(); }
    } catch (cause) { setError(messageOf(cause)); }
    finally { setWorking(false); }
  }

  /** All context-changing actions are fenced. No user edit can race their flush. */
  async function controlled(label: string, action: () => Promise<void>, retry = false) {
    if (busyRef.current || (failureRef.current && !retry)) return;
    pendingCommitRef.current?.();
    stopTimer(); setWorking(true); setNotice(null);
    failureRef.current = null; setFailure(null);
    let stage: Failure["stage"] = "save";
    try {
      await queue.flush();
      stage = "action";
      await action();
    } catch (cause) {
      const next = { label, action, stage: queue.snapshot().error ? "save" as const : stage, error: messageOf(cause) };
      failureRef.current = next; setFailure(next);
    } finally { setWorking(false); }
  }

  async function lockOrClose(close: boolean) {
    if (busyRef.current) { setNotice("An operation is running. Wait for it to finish, then try locking or closing again."); return; }
    await controlled(close ? "close the window" : "lock the vault", async () => {
      await desktopApi.lock();
      wipePlaintext();
      go("unlock");
      if (close) await getCurrentWindow().destroy();
    });
  }
  const closeRef = useRef<() => void>(() => {});
  closeRef.current = () => { void lockOrClose(true); };
  const lockRef = useRef<() => void>(() => {});
  lockRef.current = () => { void lockOrClose(false); };
  const saveRef = useRef<() => void>(() => {});
  saveRef.current = () => { if (screenRef.current === "dashboard") void controlled("save this note", async () => {}); };

  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void getCurrentWindow().onCloseRequested(event => {
      event.preventDefault();
      closeRef.current();
    }).then(stop => { if (disposed) stop(); else unlisten = stop; }).catch(cause => {
      setNotice(`Window-close protection could not be registered: ${messageOf(cause)}. Use Lock vault before closing.`);
    });
    return () => { disposed = true; unlisten?.(); };
  }, []);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.isComposing) return;
      if (event.key.toLowerCase() === "s") { event.preventDefault(); if (!busyRef.current && !failureRef.current) saveRef.current(); }
      if (event.key.toLowerCase() === "l") { event.preventDefault(); if (!busyRef.current && !failureRef.current) lockRef.current(); }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, []);

  function edit(patch: Partial<DesktopNote>) {
    const current = queue.snapshot().draft;
    if (busyRef.current || failureRef.current || !current || current.trashed || screenRef.current !== "dashboard") return;
    // The type and native identity are immutable after creation.
    queue.update({ ...current, ...patch, id: current.id, noteType: current.noteType, createdAt: current.createdAt });
  }
  useEffect(() => {
    stopTimer();
    if (!snapshot.dirty || snapshot.error || busy || failure || screen !== "dashboard") return;
    const token = epoch.current;
    autosaveTimer.current = setTimeout(() => {
      if (token !== epoch.current || busyRef.current || failureRef.current) return;
      void queue.flush().catch(() => {}); // Error is retained in the queue and shown inline; no silent retry loop.
    }, 1000);
    return stopTimer;
  }, [snapshot.revision, snapshot.dirty, snapshot.error, busy, failure, screen, queue]);

  function selectNote(id: string) {
    void controlled("switch notes", async () => choose(notesRef.current.find(note => note.id === id) || null));
  }
  function changeFilter(next: NoteFilter) {
    void controlled("change the note filter", async () => {
      filterRef.current = next; setFilter(next);
      choose(searchNotes(notesRef.current, next, queryRef.current)[0] || null);
    });
  }
  function changeQuery(next: string) {
    // Searching only changes the visible list, never switches or replaces the dirty editor.
    if (busyRef.current || failureRef.current) return;
    queryRef.current = next; setQuery(next);
  }
  function createNote(type: NoteType) {
    void controlled("create a note", async () => {
      const saved = await desktopApi.saveNote({ title: "Untitled note", content: initialContent(type), noteType: type, tags: [], pinned: false, archived: false, trashed: false });
      recordNotes([saved, ...notesRef.current]); choose(saved);
      filterRef.current = "all"; setFilter("all"); queryRef.current = ""; setQuery(""); setNewOpen(false);
    });
  }
  function flagNote(patch: Partial<DesktopNote>) {
    void controlled("update the note", async () => {
      const current = queue.snapshot().draft;
      if (!current) return;
      queue.update({ ...current, ...patch });
      // Treat this second save as a save failure, preserving explicit discard/retry.
      try { await queue.flush(); }
      catch (cause) { throw cause; }
      const updated = queue.snapshot().draft;
      if (updated && !searchNotes([updated], filterRef.current, queryRef.current).length) choose(searchNotes(notesRef.current, filterRef.current, queryRef.current)[0] || null);
    });
  }
  function permanentlyDelete() {
    void controlled("permanently delete the note", async () => {
      const current = queue.snapshot().draft;
      if (!current) return;
      await desktopApi.deleteNote(current.id);
      recordNotes(notesRef.current.filter(note => note.id !== current.id));
      choose(searchNotes(notesRef.current, filterRef.current, queryRef.current)[0] || null); setDeleteOpen(false);
    });
  }
  function openRestore() {
    if (busyRef.current || failureRef.current) return;
    if (screenRef.current !== "setup" && screenRef.current !== "dashboard") {
      setNotice("Unlock the current vault before replacing it with a backup. Use a recovery code if you forgot the PIN. To restore on another computer, start with an empty MyNotes installation.");
      return;
    }
    setRestoreReplacement(screenRef.current !== "setup"); setRestoreNotice(null); setError(null); setSettingsOpen(false); setRestoreOpen(true);
  }
  function restore(code: string, pin: string) {
    void controlled("restore the backup", async () => {
      const result = await desktopApi.restoreBackup(code, pin);
      if (result === null) { setRestoreNotice("File selection cancelled. Your current vault was not changed."); return; }
      showCodes(result.codes, true);
    });
  }

  const blocked = busy || !!failure;
  let content;
  if (screen === "dashboard") content = <Dashboard key={`vault-${epoch.current}`} notes={notes} pendingCommitRef={pendingCommitRef} snapshot={snapshot} filter={filter} query={query} tagsEntry={tagsEntry} busy={blocked} notice={notice} onFilter={changeFilter} onQuery={changeQuery} onSelect={note => selectNote(note.id)} onNew={() => { void controlled("start a new note", async () => setNewOpen(true)); }} onEdit={edit} onTags={value => { if (blocked) return; setTagsEntry(value); edit({ tags: parseTags(value) }); }} onSave={() => saveRef.current()} onRetry={() => saveRef.current()} onLock={() => lockRef.current()} onSettings={() => { void controlled("open vault settings", async () => { setSettingsOpen(true); }); }} onFlag={flagNote} onDelete={() => { void controlled("review permanent deletion", async () => setDeleteOpen(true)); }} />;
  else if (screen === "setup" || screen === "unlock" || screen === "recover") content = <AccessScreen key={screen} mode={screen} busy={blocked} error={error} remaining={remaining} onSubmit={access} onMode={mode => { setError(null); go(mode); }} onRestore={openRestore} />;
  else if (screen === "codes") content = <CodesScreen codes={codes} fresh={freshCodes} busy={blocked} error={error} onContinue={() => { if (busyRef.current) return; setWorking(true); setError(null); void openDashboard().catch(cause => setError(messageOf(cause))).finally(() => setWorking(false)); }} />;
  else content = <VaultShell><div className="vault-card"><span className="card-icon">{screen === "error" ? <AlertTriangle size={26} aria-hidden="true" /> : <LockKeyhole size={26} aria-hidden="true" />}</span><h2>{screen === "runtime" ? "Desktop runtime required" : screen === "error" ? "Vault unavailable" : "Opening MyNotes…"}</h2><p className="muted">{screen === "runtime" ? "This is the native MyNotes Desktop application. Open it in the installed desktop app to use the encrypted SQLite vault. Browser preview cannot create or unlock a vault." : screen === "error" ? "The native vault status could not be read. Nothing has been reset or overwritten. Retry, or restore a known encrypted backup intentionally." : "Checking the encrypted vault on this device."}</p><InlineError message={error} />{screen === "error" && <><button className="button primary wide" disabled={blocked} onClick={() => { void readStatus(); }}><RefreshCw size={16} aria-hidden="true" /> Retry status check</button><button className="text-button" disabled={blocked} onClick={openRestore}>Restore a known backup…</button></>}</div></VaultShell>;

  return <>{screen !== "dashboard" && notice && <div className="global-notice" role="status" aria-live="polite">{notice}</div>}{content}
    {settingsOpen && <SettingsDialog open busy={blocked} notice={notice} onClose={() => setSettingsOpen(false)} onChangePin={(current, pin, done) => { void controlled("change the PIN", async () => { await desktopApi.changePin(current, pin); done(); setNotice("PIN changed. Use the new PIN next time you unlock this vault."); }); }} onRegenerate={() => { void controlled("generate recovery codes", async () => showCodes((await desktopApi.regenerateCodes()).codes, true)); }} onBackup={() => { void controlled("export the encrypted backup", async () => { const path = await desktopApi.exportBackup(); setNotice(path === null ? "Backup export cancelled. Nothing was changed." : `Encrypted backup saved to ${path}`); }); }} onRestore={openRestore} />}
    {restoreOpen && <RestoreDialog open replacement={restoreReplacement} busy={blocked} error={null} notice={restoreNotice} onClose={() => { setRestoreOpen(false); setError(null); }} onSubmit={restore} />}
    {newOpen && <NewNoteDialog open busy={blocked} onClose={() => setNewOpen(false)} onCreate={createNote} />}
    <Dialog open={deleteOpen} onOpenChange={value => { if (!value && !blocked) setDeleteOpen(false); }}><DialogContent className="desktop-dialog" showCloseButton={!blocked}><DialogHeader><DialogTitle>Permanently delete this note?</DialogTitle><DialogDescription>This is separate from moving to Trash. “{snapshot.draft?.title || "Untitled note"}” will be removed from this vault and cannot be restored here. Existing backups are not changed.</DialogDescription></DialogHeader><div className="dialog-actions"><button className="button secondary" disabled={blocked} onClick={() => setDeleteOpen(false)}>Cancel</button><button className="button destructive" disabled={blocked} onClick={permanentlyDelete}>Delete permanently</button></div></DialogContent></Dialog>
    <Dialog open={!!failure} onOpenChange={value => { if (!value && !busy) { failureRef.current = null; setFailure(null); } }}><DialogContent className="desktop-dialog" showCloseButton={!busy} onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onInteractOutside={event => event.preventDefault()}><DialogHeader><DialogTitle>{failure?.stage === "save" ? "Your edits could not be saved" : "The operation did not finish"}</DialogTitle><DialogDescription>{failure?.stage === "save" ? `We stopped before trying to ${failure.label}. Your latest draft is still in memory. Retry saving, cancel to keep editing, or explicitly discard unsaved edits and continue.` : `Could not ${failure?.label}. The window remains open. No unsaved edits were silently discarded.`}</DialogDescription></DialogHeader><p className="inline-error" role="alert">{failure?.error}</p><div className="dialog-actions wrap"><button className="button secondary" disabled={busy} onClick={() => { failureRef.current = null; setFailure(null); }}>Cancel</button><button className="button primary" disabled={busy} onClick={() => { const pending = failureRef.current; if (pending) void controlled(pending.label, pending.action, true); }}>Retry</button>{failure?.stage === "save" && <button className="button destructive" disabled={busy} onClick={() => { const pending = failureRef.current; if (!pending) return; queue.discard(); setTagsEntry(queue.snapshot().draft?.tags.join(", ") || ""); void controlled(pending.label, pending.action, true); }}>Discard unsaved edits & continue</button>}</div></DialogContent></Dialog>
  </>;
}
