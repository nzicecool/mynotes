import { useEffect, useRef, type ComponentType, type RefObject } from "react";
import { Archive, ArchiveRestore, Check, CheckSquare, ChevronRight, Code2, FileText, Hash, LayoutGrid, LockKeyhole, NotebookPen, Pin, Plus, RotateCcw, Save, Search, Settings2, ShieldCheck, Table2, Trash2 } from "lucide-react";
import { RichTextEditor } from "@/components/editors/RichTextEditor";
import { MarkdownEditor } from "@/components/editors/MarkdownEditor";
import { ChecklistEditor } from "@/components/editors/ChecklistEditor";
import { CodeEditor } from "@/components/editors/CodeEditor";
import { SpreadsheetEditor } from "@/components/editors/SpreadsheetEditor";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Brand } from "./VaultScreens";
import { NOTE_TYPES, searchNotes, type NoteFilter } from "./helpers";
import type { DesktopNote, NoteType } from "./types";
import type { SaveSnapshot } from "./saveQueue";

const icons: Record<NoteType, ComponentType<{ size?: number; "aria-hidden"?: boolean | "true" | "false" }>> = { plain: FileText, rich: NotebookPen, markdown: Hash, checklist: CheckSquare, code: Code2, spreadsheet: Table2 };
const filters: { value: NoteFilter; label: string; icon: typeof LayoutGrid }[] = [
  { value: "all", label: "All notes", icon: LayoutGrid }, { value: "pinned", label: "Pinned", icon: Pin }, { value: "archived", label: "Archive", icon: Archive }, { value: "trash", label: "Trash", icon: Trash2 },
];

/** Add accessible names locally without modifying the shared editor files. */
function Editor({ note, onChange, pendingCommitRef }: { note: DesktopNote; onChange: (content: string) => void; pendingCommitRef: RefObject<(() => void) | null> }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    pendingCommitRef.current = () => {
      if (note.noteType !== "checklist") return;
      const addInput = root.querySelector<HTMLInputElement>("input[placeholder]");
      const addButton = root.querySelector(".lucide-plus")?.closest<HTMLButtonElement>("button");
      if (addInput?.value.trim() && addButton && !addButton.disabled) addButton.click();
    };
    const label = () => {
      root.querySelectorAll("button").forEach(button => {
        if (!button.getAttribute("aria-label") && !button.textContent?.trim()) button.setAttribute("aria-label", button.title || (note.noteType === "checklist" ? (button.querySelector(".lucide-plus") ? "Add checklist item" : "Delete checklist item") : "Editor action"));
      });
      root.querySelectorAll("input, textarea, [contenteditable='true']").forEach((input, index) => {
        if (!input.hasAttribute("aria-label")) input.setAttribute("aria-label", note.noteType === "spreadsheet" ? `Spreadsheet cell ${index + 1}` : input.getAttribute("placeholder") || "Note body");
      });
      // The shared Markdown editor accepts HTML. Keep its preview inert and
      // strip non-formatting markup locally; native CSP is the fetch barrier.
      if (note.noteType === "markdown") {
        const allowed = new Set(["P", "H1", "H2", "H3", "H4", "H5", "H6", "STRONG", "EM", "DEL", "CODE", "PRE", "BLOCKQUOTE", "LI", "UL", "OL", "HR", "BR", "A"]);
        root.querySelectorAll(".prose > *, .prose *").forEach(element => {
          if (!allowed.has(element.tagName)) { element.replaceWith(document.createTextNode(element.textContent || "")); return; }
          for (const attr of Array.from(element.attributes)) element.removeAttribute(attr.name);
        });
      }
    };
    label();
    const observer = new MutationObserver(label);
    observer.observe(root, { subtree: true, childList: true });
    return () => { observer.disconnect(); pendingCommitRef.current = null; };
  }, [note.noteType, pendingCommitRef]);
  let editor;
  switch (note.noteType) {
    case "rich": editor = <RichTextEditor value={note.content} onChange={onChange} />; break;
    case "markdown": editor = <MarkdownEditor value={note.content} onChange={onChange} />; break;
    case "checklist": editor = <ChecklistEditor value={note.content} onChange={onChange} />; break;
    case "code": editor = <CodeEditor value={note.content} onChange={onChange} />; break;
    case "spreadsheet": editor = <SpreadsheetEditor value={note.content} onChange={onChange} />; break;
    default: editor = <textarea className="plain-editor" aria-label="Note body" value={note.content} placeholder="Start with a thought…" onChange={event => onChange(event.target.value)} />;
  }
  return <div className="editor-host" ref={ref} onClickCapture={event => { if ((event.target as Element).closest("a")) { event.preventDefault(); event.stopPropagation(); } }}>{editor}</div>;
}

interface DashboardProps {
  notes: DesktopNote[];
  pendingCommitRef: RefObject<(() => void) | null>;
  snapshot: SaveSnapshot<DesktopNote>;
  filter: NoteFilter;
  query: string;
  tagsEntry: string;
  busy: boolean;
  notice: string | null;
  onFilter: (filter: NoteFilter) => void;
  onQuery: (query: string) => void;
  onSelect: (note: DesktopNote) => void;
  onNew: () => void;
  onEdit: (patch: Partial<DesktopNote>) => void;
  onTags: (value: string) => void;
  onSave: () => void;
  onLock: () => void;
  onSettings: () => void;
  onFlag: (patch: Partial<DesktopNote>) => void;
  onDelete: () => void;
  onRetry: () => void;
}

export default function Dashboard(props: DashboardProps) {
  const { notes, snapshot, filter, query, busy, notice } = props;
  const note = snapshot.draft;
  const listNotes = notes.map(saved => note?.id === saved.id ? note : saved);
  const visible = searchNotes(listNotes, filter, query);
  const filterName = filters.find(item => item.value === filter)!.label;
  const Icon = note ? icons[note.noteType] : FileText;
  const saveLabel = snapshot.error ? "Save failed — unsaved changes" : snapshot.saving ? "Saving…" : snapshot.dirty ? "Unsaved changes" : "All changes saved";
  return <div className="desktop-dashboard">
    <aside className="app-sidebar" aria-label="Vault navigation"><Brand compact /><button className="button primary new-note" disabled={busy} onClick={props.onNew}><Plus size={17} aria-hidden="true" /> New note <kbd>N</kbd></button><span className="nav-caption">YOUR WORKSPACE</span><nav>{filters.map(item => <button key={item.value} className={`nav-item ${filter === item.value ? "active" : ""}`} disabled={busy} aria-current={filter === item.value ? "page" : undefined} onClick={() => props.onFilter(item.value)}><item.icon size={17} aria-hidden="true" /><span>{item.label}</span><small>{searchNotes(listNotes, item.value, "").length}</small></button>)}</nav>
      <div className="sidebar-bottom"><div className="local-status"><ShieldCheck size={16} aria-hidden="true" /><div><strong>Local & encrypted</strong><small>On this device only</small></div><span className="status-dot" /></div><button className="nav-item" disabled={busy} onClick={props.onSettings}><Settings2 size={17} aria-hidden="true" /><span>Vault settings</span></button><button className="nav-item" disabled={busy} onClick={props.onLock}><LockKeyhole size={17} aria-hidden="true" /><span>Lock vault</span><kbd>⌘/Ctrl L</kbd></button></div>
    </aside>
    <section className="notes-panel" aria-label="Notes list"><header className="notes-header"><span className="eyebrow">PERSONAL LIBRARY</span><h1>{filterName}<small>{visible.length}</small></h1><label className="search-field"><Search size={16} aria-hidden="true" /><span className="sr-only">Search titles, bodies and tags</span><input type="search" placeholder="Search your notes…" value={query} disabled={busy} onChange={event => props.onQuery(event.target.value)} /><kbd>Search</kbd></label></header><div className="notes-list">{visible.length === 0 ? <div className="list-empty"><FileText size={26} aria-hidden="true" /><h2>{query ? "No matches" : "A little room to think"}</h2><p>{query ? "Try another title, phrase or tag." : filter === "all" ? "Create a note to get started." : `No notes in ${filterName.toLowerCase()} yet.`}</p>{filter === "all" && !query && <button className="text-button" disabled={busy} onClick={props.onNew}>Create your first note <ChevronRight size={14} aria-hidden="true" /></button>}</div> : visible.map(item => {
      const NoteIcon = icons[item.noteType];
      const preview = item.content.replace(/<[^>]*>/g, " ").replace(/[\[\]{}"#*`]/g, "").replace(/\s+/g, " ").slice(0, 105);
      return <button className={`note-card ${note?.id === item.id ? "selected" : ""}`} disabled={busy} key={item.id} onClick={() => props.onSelect(item)} aria-pressed={note?.id === item.id}><div className="note-card-top"><span className="type-icon"><NoteIcon size={15} aria-hidden="true" /></span><time dateTime={new Date(item.updatedAt).toISOString()}>{new Date(item.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</time>{item.pinned && <Pin size={12} aria-label="Pinned" />}</div><h2>{item.title || "Untitled note"}</h2><p>{preview || "An unwritten beginning…"}</p>{item.tags.length > 0 && <div className="note-tags">{item.tags.slice(0, 3).map(tag => <span key={tag}>{tag}</span>)}</div>}</button>;
    })}</div><footer className="notes-footer">Private by design. Yours by default.</footer></section>
    <main className="editor-panel"><header className="editor-topbar"><span className="breadcrumb">My vault <ChevronRight size={12} aria-hidden="true" /> {note ? NOTE_TYPES.find(type => type.value === note.noteType)?.label : "Workspace"}</span><div className={`save-indicator ${snapshot.error ? "failed" : ""}`} role="status" aria-live="polite">{!snapshot.saving && !snapshot.dirty && <Check size={13} aria-hidden="true" />}{saveLabel}</div><button className="button secondary save-button" disabled={busy || !note} onClick={props.onSave} title="Save note (Ctrl/Cmd+S)"><Save size={15} aria-hidden="true" /> Save</button></header>
    {notice && <div className="dashboard-notice" role="status" aria-live="polite">{notice}</div>}{!!snapshot.error && <div className="save-error" role="alert">Your latest edits are still here, but were not saved. <button className="text-button" disabled={busy} onClick={props.onRetry}>Retry saving</button></div>}
    {note ? <><section className="note-details"><div className="note-details-heading"><span className="note-kind"><Icon size={14} aria-hidden="true" />{NOTE_TYPES.find(type => type.value === note.noteType)?.label}</span><div className="note-actions">{note.trashed ? <><button className="icon-button" aria-label="Restore note from trash" title="Restore from trash" disabled={busy} onClick={() => props.onFlag({ trashed: false })}><RotateCcw size={17} aria-hidden="true" /></button><button className="icon-button danger" aria-label="Permanently delete note" title="Permanently delete…" disabled={busy} onClick={props.onDelete}><Trash2 size={17} aria-hidden="true" /></button></> : <><button className={`icon-button ${note.pinned ? "active" : ""}`} aria-label={note.pinned ? "Unpin note" : "Pin note"} aria-pressed={note.pinned} disabled={busy} onClick={() => props.onFlag({ pinned: !note.pinned })}><Pin size={17} aria-hidden="true" /></button><button className={`icon-button ${note.archived ? "active" : ""}`} aria-label={note.archived ? "Unarchive note" : "Archive note"} disabled={busy} onClick={() => props.onFlag({ archived: !note.archived })}>{note.archived ? <ArchiveRestore size={17} aria-hidden="true" /> : <Archive size={17} aria-hidden="true" />}</button><button className="icon-button" aria-label="Move note to trash" disabled={busy} onClick={() => props.onFlag({ trashed: true })}><Trash2 size={17} aria-hidden="true" /></button></>}</div></div>
    <label htmlFor="note-title" className="sr-only">Note title</label><input id="note-title" className="note-title" value={note.title} placeholder="Untitled note" disabled={busy || note.trashed} onChange={event => props.onEdit({ title: event.target.value })} /><label className="tags-field" htmlFor="note-tags"><Hash size={14} aria-hidden="true" /><span className="sr-only">Tags, separated by commas</span><input id="note-tags" value={props.tagsEntry} disabled={busy || note.trashed} placeholder="Add tags, separated by commas…" onChange={event => props.onTags(event.target.value)} /><span>Encrypted tags</span></label>{note.trashed && <p className="muted trash-hint">This note is in Trash. Restore it before editing.</p>}</section>
    <div className="editor-frame" inert={busy || note.trashed} aria-label="Note editor" aria-busy={busy}><Editor key={note.id} note={note} pendingCommitRef={props.pendingCommitRef} onChange={content => props.onEdit({ content })} /></div><footer className="editor-footer"><span>{note.content.length.toLocaleString()} characters</span><span>Autosave after 1 second · Type fixed at creation</span></footer></> : <div className="workspace-empty"><span className="empty-symbol"><NotebookPen size={37} aria-hidden="true" /></span><span className="eyebrow">MAKE SPACE FOR AN IDEA</span><h2>A blank page, a fresh start.</h2><p>Choose a note from your library,<br />or create something new.</p><button className="button primary" disabled={busy} onClick={props.onNew}><Plus size={16} aria-hidden="true" /> Create a note</button><div className="empty-types">Text · Rich text · Markdown · Lists · Code · Sheets</div></div>}
    </main>
  </div>;
}

export function NewNoteDialog({ open, busy, onClose, onCreate }: { open: boolean; busy: boolean; onClose: () => void; onCreate: (type: NoteType) => void }) {
  return <Dialog open={open} onOpenChange={value => { if (!value && !busy) onClose(); }}><DialogContent className="desktop-dialog" showCloseButton={!busy}><DialogHeader><DialogTitle>A new place to begin</DialogTitle><DialogDescription>Choose a note type. Its format stays fixed so your content is never converted or lost.</DialogDescription></DialogHeader><div className="type-grid">{NOTE_TYPES.map(type => {
    const Icon = icons[type.value];
    return <button className="type-choice" key={type.value} disabled={busy} onClick={() => onCreate(type.value)}><Icon size={21} aria-hidden="true" /><strong>{type.label}</strong><small>{type.detail}</small></button>;
  })}</div></DialogContent></Dialog>;
}
