import { useAuth } from "@/_core/hooks/useAuth";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  hasEncryptionKey,
  encrypt,
  decrypt,
  getEncryptionKey,
  clearEncryptionKey,
} from "@/lib/encryption";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";
import {
  Plus,
  Search,
  FileText,
  Trash2,
  LogOut,
  Lock,
  Save,
  X,
  StickyNote,
  Tag,
  TagIcon,
  Check,
  Loader2,
} from "lucide-react";
import {
  NoteTypeSelector,
  NoteTypeBadge,
  NOTE_TYPES,
  type NoteType,
} from "@/components/NoteTypeSelector";
import { RichTextEditor } from "@/components/editors/RichTextEditor";
import { MarkdownEditor } from "@/components/editors/MarkdownEditor";
import { ChecklistEditor } from "@/components/editors/ChecklistEditor";
import { CodeEditor } from "@/components/editors/CodeEditor";
import { SpreadsheetEditor } from "@/components/editors/SpreadsheetEditor";

// ─── Tag colours ─────────────────────────────────────────────────────────────

const TAG_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f43f5e", "#f97316",
  "#eab308", "#22c55e", "#14b8a6", "#3b82f6", "#64748b",
];

// ─── Types ────────────────────────────────────────────────────────────────────

type NoteItem = {
  id: number;
  title: string | null;
  encryptedContent: string;
  noteType: string;
  isPinned: number;
  isArchived: number;
  isTrashed: number;
  createdAt: Date;
  updatedAt: Date;
  userId: number;
};

type TagItem = { id: number; name: string; color: string | null };

// ─── Dashboard ───────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  // Editor state
  const [selectedNoteId, setSelectedNoteId] = useState<number | null>(null);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [noteType, setNoteType] = useState<NoteType>("plain");
  const [isEditing, setIsEditing] = useState(false);

  // Tag management state
  const [activeTagId, setActiveTagId] = useState<number | null>(null);
  const [showTagDialog, setShowTagDialog] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);
  const [noteTagIds, setNoteTagIds] = useState<number[]>([]);

  // UI state
  const [searchQuery, setSearchQuery] = useState("");
  const [showTypeDialog, setShowTypeDialog] = useState(false);
  const [pendingType, setPendingType] = useState<NoteType>("plain");

  // Auto-save
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const lastSavedContentRef = useRef<string>("");

  // Data
  const { data: notes = [] as NoteItem[], refetch: refetchNotes } = trpc.notes.list.useQuery();
  const { data: allTags = [] as TagItem[], refetch: refetchTags } = trpc.tags.list.useQuery();
  const createNoteMutation = trpc.notes.create.useMutation();
  const updateNoteMutation = trpc.notes.update.useMutation();
  const deleteNoteMutation = trpc.notes.delete.useMutation();
  const createTagMutation = trpc.tags.create.useMutation();
  const deleteTagMutation = trpc.tags.delete.useMutation();
  const addTagToNoteMutation = trpc.tags.addToNote.useMutation();
  const removeTagFromNoteMutation = trpc.tags.removeFromNote.useMutation();

  // Redirect if no encryption key
  useEffect(() => {
    if (!hasEncryptionKey()) {
      setLocation("/setup");
    }
  }, [setLocation]);

  // ─── Auto-save logic ─────────────────────────────────────────────────────────

  const triggerAutoSave = (content: string, title: string) => {
    if (!selectedNoteId) return; // Only auto-save existing notes
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);

    autoSaveTimerRef.current = setTimeout(async () => {
      if (content === lastSavedContentRef.current) return; // No change
      const key = getEncryptionKey();
      if (!key) return;
      try {
        setAutoSaveStatus("saving");
        const encryptedContent = await encrypt(content, key);
        await updateNoteMutation.mutateAsync({
          id: selectedNoteId,
          title: title || "Untitled",
          encryptedContent,
        });
        lastSavedContentRef.current = content;
        setAutoSaveStatus("saved");
        refetchNotes();
        setTimeout(() => setAutoSaveStatus("idle"), 2000);
      } catch {
        setAutoSaveStatus("idle");
      }
    }, 30_000); // 30 seconds
  };

  const handleContentChange = (value: string) => {
    setNoteContent(value);
    triggerAutoSave(value, noteTitle);
  };

  const handleTitleChange = (value: string) => {
    setNoteTitle(value);
    triggerAutoSave(noteContent, value);
  };

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, []);

  // ─── Helpers ────────────────────────────────────────────────────────────────

  const getKey = () => {
    const key = getEncryptionKey();
    if (!key) {
      toast.error("Encryption key not available. Please re-enter your password.");
      setLocation("/setup");
    }
    return key;
  };

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const handleNewNote = () => {
    setSelectedNoteId(null);
    setNoteTitle("");
    setNoteContent("");
    setNoteTagIds([]);
    setPendingType("plain");
    setShowTypeDialog(true);
  };

  const handleTypeSelected = (type: NoteType) => {
    setNoteType(type);
    setShowTypeDialog(false);
    setIsEditing(true);
  };

  const handleCreateNote = async () => {
    if (!noteContent.trim()) {
      toast.error("Note content cannot be empty");
      return;
    }
    const key = getKey();
    if (!key) return;

    try {
      const encryptedContent = await encrypt(noteContent, key);
      await createNoteMutation.mutateAsync({
        title: noteTitle || "Untitled",
        encryptedContent,
        noteType,
      });
      toast.success("Note created");
      setNoteTitle("");
      setNoteContent("");
      setIsEditing(false);
      lastSavedContentRef.current = "";
      refetchNotes();
    } catch (error) {
      console.error("Create note error:", error);
      toast.error("Failed to create note");
    }
  };

  const handleUpdateNote = async () => {
    if (!selectedNoteId) return;
    const key = getKey();
    if (!key) return;

    try {
      const encryptedContent = await encrypt(noteContent, key);
      await updateNoteMutation.mutateAsync({
        id: selectedNoteId,
        title: noteTitle || "Untitled",
        encryptedContent,
      });
      lastSavedContentRef.current = noteContent;
      toast.success("Note saved");
      refetchNotes();
    } catch (error) {
      console.error("Update note error:", error);
      toast.error("Failed to save note");
    }
  };

  const handleSelectNote = async (noteId: number) => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    const note = notes.find((n: NoteItem) => n.id === noteId);
    if (!note) return;

    const key = getKey();
    if (!key) return;

    try {
      const decryptedContent = await decrypt(note.encryptedContent, key);
      if (decryptedContent === null) {
        toast.error("Could not decrypt this note. It may have been encrypted with a different password.");
        return;
      }
      setSelectedNoteId(noteId);
      setNoteTitle(note.title || "");
      setNoteContent(decryptedContent);
      setNoteType(note.noteType as NoteType);
      setIsEditing(false);
      lastSavedContentRef.current = decryptedContent;
      setAutoSaveStatus("idle");

      // Load tags for this note
      const tagData = await trpc.useUtils().tags.getForNote.fetch({ noteId });
      setNoteTagIds(tagData.map((t: TagItem) => t.id));
    } catch (error) {
      console.error("Decrypt error:", error);
      toast.error("Failed to decrypt note");
    }
  };

  const handleDeleteNote = async (noteId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this note?")) return;
    try {
      await deleteNoteMutation.mutateAsync({ id: noteId });
      toast.success("Note deleted");
      if (selectedNoteId === noteId) {
        setSelectedNoteId(null);
        setNoteTitle("");
        setNoteContent("");
        setNoteTagIds([]);
        setIsEditing(false);
      }
      refetchNotes();
    } catch (error) {
      console.error("Delete note error:", error);
      toast.error("Failed to delete note");
    }
  };

  const handleLogout = async () => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    clearEncryptionKey();
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
    window.location.href = "/login";
  };

  const handleCancel = () => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    setIsEditing(false);
    setSelectedNoteId(null);
    setNoteTitle("");
    setNoteContent("");
    setNoteTagIds([]);
    setAutoSaveStatus("idle");
  };

  // ─── Tag handlers ─────────────────────────────────────────────────────────

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    try {
      await createTagMutation.mutateAsync({ name: newTagName.trim(), color: newTagColor });
      setNewTagName("");
      setNewTagColor(TAG_COLORS[0]);
      refetchTags();
      toast.success("Tag created");
    } catch {
      toast.error("Failed to create tag");
    }
  };

  const handleDeleteTag = async (tagId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this tag? It will be removed from all notes.")) return;
    try {
      await deleteTagMutation.mutateAsync({ id: tagId });
      if (activeTagId === tagId) setActiveTagId(null);
      refetchTags();
      toast.success("Tag deleted");
    } catch {
      toast.error("Failed to delete tag");
    }
  };

  const handleToggleTagOnNote = async (tagId: number) => {
    if (!selectedNoteId) return;
    const hasTag = noteTagIds.includes(tagId);
    try {
      if (hasTag) {
        await removeTagFromNoteMutation.mutateAsync({ noteId: selectedNoteId, tagId });
        setNoteTagIds((prev) => prev.filter((id) => id !== tagId));
      } else {
        await addTagToNoteMutation.mutateAsync({ noteId: selectedNoteId, tagId });
        setNoteTagIds((prev) => [...prev, tagId]);
      }
    } catch {
      toast.error("Failed to update tag");
    }
  };

  // ─── Derived ─────────────────────────────────────────────────────────────────

  const filteredNotes = notes.filter((note: NoteItem) => {
    const matchesSearch = (note.title?.toLowerCase() || "").includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  // When a tag filter is active, we need note IDs that have that tag.
  // We use a client-side filter based on noteTagIds loaded per note — but for
  // the sidebar list we need a different approach: fetch all note IDs for the tag.
  // We'll use a separate query for this.
  const tagFilterQuery = trpc.tags.getNoteIdsByTag.useQuery(
    { tagId: activeTagId! },
    { enabled: activeTagId !== null }
  );
  const tagFilteredNoteIds = activeTagId !== null ? (tagFilterQuery.data ?? []) : null;

  const visibleNotes = tagFilteredNoteIds !== null
    ? filteredNotes.filter((n: NoteItem) => tagFilteredNoteIds.includes(n.id))
    : filteredNotes;

  const isActive = selectedNoteId !== null || isEditing;
  const isSaving = createNoteMutation.isPending || updateNoteMutation.isPending;

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* ── Header ── */}
      <header className="border-b bg-card px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
            <StickyNote className="w-4 h-4 text-white" />
          </div>
          <span className="text-lg font-semibold">MyNotes</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground hidden sm:block">{user?.name}</span>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="w-4 h-4 mr-1.5" />
            Logout
          </Button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* ── Sidebar ── */}
        <aside className="w-72 border-r bg-muted/20 flex flex-col shrink-0">
          <div className="p-3 space-y-2 border-b">
            <Button className="w-full gap-2" onClick={handleNewNote}>
              <Plus className="w-4 h-4" />
              New Note
            </Button>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Search notes…"
                className="pl-8 h-8 text-sm"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* ── Tag filter panel ── */}
          {allTags.length > 0 && (
            <div className="px-3 py-2 border-b">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Tags</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 w-5 p-0"
                  onClick={() => setShowTagDialog(true)}
                  title="Manage tags"
                >
                  <Plus className="w-3 h-3" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-1">
                {activeTagId !== null && (
                  <button
                    onClick={() => setActiveTagId(null)}
                    className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-300 hover:bg-indigo-200 transition-colors"
                  >
                    <X className="w-2.5 h-2.5" />
                    Clear
                  </button>
                )}
                {allTags.map((tag: TagItem) => (
                  <button
                    key={tag.id}
                    onClick={() => setActiveTagId(activeTagId === tag.id ? null : tag.id)}
                    className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
                      activeTagId === tag.id
                        ? "text-white border-transparent"
                        : "bg-transparent border-current hover:opacity-80"
                    }`}
                    style={
                      activeTagId === tag.id
                        ? { backgroundColor: tag.color ?? "#6366f1", borderColor: tag.color ?? "#6366f1" }
                        : { color: tag.color ?? "#6366f1" }
                    }
                  >
                    <TagIcon className="w-2.5 h-2.5" />
                    {tag.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Add first tag CTA (when no tags exist) ── */}
          {allTags.length === 0 && (
            <div className="px-3 py-2 border-b">
              <button
                onClick={() => setShowTagDialog(true)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Tag className="w-3 h-3" />
                Add tags to organise notes
              </button>
            </div>
          )}

          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {visibleNotes.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <FileText className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">
                    {activeTagId !== null ? "No notes with this tag" : "No notes yet"}
                  </p>
                  {activeTagId === null && (
                    <p className="text-xs mt-1">Click "New Note" to get started</p>
                  )}
                </div>
              ) : (
                visibleNotes.map((note: NoteItem) => {
                  const typeMeta = NOTE_TYPES.find((t) => t.type === note.noteType);
                  const Icon = typeMeta?.icon ?? FileText;
                  return (
                    <div
                      key={note.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleSelectNote(note.id)}
                      onKeyDown={(e) => e.key === "Enter" && handleSelectNote(note.id)}
                      className={`w-full text-left rounded-lg px-3 py-2.5 transition-colors group flex items-start gap-2.5 cursor-pointer ${
                        selectedNoteId === note.id
                          ? "bg-indigo-50 border border-indigo-200 dark:bg-indigo-950/40 dark:border-indigo-800"
                          : "hover:bg-accent border border-transparent"
                      }`}
                    >
                      <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${typeMeta?.color ?? "text-gray-500"}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{note.title || "Untitled"}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">
                            {typeMeta?.label ?? note.noteType}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(note.updatedAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 shrink-0"
                        onClick={(e) => handleDeleteNote(note.id, e)}
                      >
                        <Trash2 className="w-3 h-3 text-destructive" />
                      </Button>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </aside>

        {/* ── Main Editor Area ── */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {isActive ? (
            <>
              {/* Editor toolbar */}
              <div className="border-b px-4 py-2.5 flex items-center gap-3 shrink-0 bg-card">
                <Input
                  placeholder="Note title…"
                  value={noteTitle}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  className="flex-1 text-base font-medium border-none shadow-none focus-visible:ring-0 px-0 h-8"
                />
                <div className="flex items-center gap-2 shrink-0">
                  {/* Auto-save indicator */}
                  {selectedNoteId && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      {autoSaveStatus === "saving" && (
                        <><Loader2 className="w-3 h-3 animate-spin" /> Saving…</>
                      )}
                      {autoSaveStatus === "saved" && (
                        <><Check className="w-3 h-3 text-green-500" /> Saved</>
                      )}
                    </span>
                  )}

                  {/* Tag picker (only for existing notes) */}
                  {selectedNoteId && allTags.length > 0 && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
                          <Tag className="w-3 h-3" />
                          Tags
                          {noteTagIds.length > 0 && (
                            <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                              {noteTagIds.length}
                            </Badge>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-52 p-2" align="end">
                        <p className="text-xs font-semibold text-muted-foreground mb-2 px-1">Assign tags</p>
                        <div className="space-y-0.5">
                          {allTags.map((tag: TagItem) => {
                            const active = noteTagIds.includes(tag.id);
                            return (
                              <button
                                key={tag.id}
                                onClick={() => handleToggleTagOnNote(tag.id)}
                                className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent text-sm transition-colors"
                              >
                                <div
                                  className="w-2.5 h-2.5 rounded-full shrink-0"
                                  style={{ backgroundColor: tag.color ?? "#6366f1" }}
                                />
                                <span className="flex-1 text-left truncate">{tag.name}</span>
                                {active && <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
                              </button>
                            );
                          })}
                        </div>
                        <div className="border-t mt-2 pt-2">
                          <button
                            onClick={() => setShowTagDialog(true)}
                            className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent text-xs text-muted-foreground transition-colors"
                          >
                            <Plus className="w-3 h-3" />
                            Manage tags
                          </button>
                        </div>
                      </PopoverContent>
                    </Popover>
                  )}

                  <NoteTypeBadge type={noteType} />
                  <Button
                    size="sm"
                    onClick={selectedNoteId ? handleUpdateNote : handleCreateNote}
                    disabled={isSaving}
                    className="gap-1.5"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {isSaving ? "Saving…" : selectedNoteId ? "Save" : "Create"}
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={handleCancel}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Note tags display */}
              {selectedNoteId && noteTagIds.length > 0 && (
                <div className="px-4 py-1.5 border-b flex items-center gap-1.5 flex-wrap bg-card/50">
                  {allTags
                    .filter((t: TagItem) => noteTagIds.includes(t.id))
                    .map((tag: TagItem) => (
                      <span
                        key={tag.id}
                        className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full text-white"
                        style={{ backgroundColor: tag.color ?? "#6366f1" }}
                      >
                        <TagIcon className="w-2.5 h-2.5" />
                        {tag.name}
                      </span>
                    ))}
                </div>
              )}

              {/* Editor body */}
              <div className="flex-1 overflow-hidden">
                <NoteEditor
                  type={noteType}
                  value={noteContent}
                  onChange={handleContentChange}
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center max-w-xs">
                <Lock className="w-14 h-14 mx-auto mb-4 opacity-30" />
                <p className="text-base font-medium">Select a note or create a new one</p>
                <p className="text-sm mt-1 opacity-70">All notes are end-to-end encrypted</p>
                <Button className="mt-4 gap-2" onClick={handleNewNote}>
                  <Plus className="w-4 h-4" />
                  New Note
                </Button>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ── Note Type Picker Dialog ── */}
      <Dialog open={showTypeDialog} onOpenChange={setShowTypeDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Choose a Note Type
            </DialogTitle>
          </DialogHeader>
          <NoteTypeSelector
            value={pendingType}
            onChange={(t) => {
              setPendingType(t);
              handleTypeSelected(t);
            }}
          />
          <p className="text-xs text-muted-foreground text-center pb-2">
            The note type determines which editor is used. You can change it later.
          </p>
        </DialogContent>
      </Dialog>

      {/* ── Tag Management Dialog ── */}
      <Dialog open={showTagDialog} onOpenChange={setShowTagDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="w-4 h-4" />
              Manage Tags
            </DialogTitle>
          </DialogHeader>

          {/* Create new tag */}
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="Tag name…"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateTag()}
                className="flex-1 h-8 text-sm"
              />
              <Button size="sm" onClick={handleCreateTag} disabled={!newTagName.trim() || createTagMutation.isPending}>
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </div>

            {/* Color picker */}
            <div className="flex gap-1.5 flex-wrap">
              {TAG_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setNewTagColor(color)}
                  className={`w-6 h-6 rounded-full transition-transform ${newTagColor === color ? "scale-125 ring-2 ring-offset-1 ring-current" : "hover:scale-110"}`}
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
            </div>

            {/* Existing tags list */}
            {allTags.length > 0 && (
              <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
                {allTags.map((tag: TagItem) => (
                  <div key={tag.id} className="flex items-center gap-2 px-3 py-2">
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: tag.color ?? "#6366f1" }}
                    />
                    <span className="flex-1 text-sm truncate">{tag.name}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                      onClick={(e) => handleDeleteTag(tag.id, e)}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {allTags.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No tags yet. Create one above.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Editor dispatcher ────────────────────────────────────────────────────────

function NoteEditor({
  type,
  value,
  onChange,
}: {
  type: NoteType;
  value: string;
  onChange: (v: string) => void;
}) {
  switch (type) {
    case "rich":
      return (
        <div className="h-full p-4">
          <RichTextEditor value={value} onChange={onChange} />
        </div>
      );
    case "markdown":
      return <MarkdownEditor value={value} onChange={onChange} />;
    case "checklist":
      return <ChecklistEditor value={value} onChange={onChange} />;
    case "code":
      return <CodeEditor value={value} onChange={onChange} />;
    case "spreadsheet":
      return <SpreadsheetEditor value={value} onChange={onChange} />;
    case "plain":
    default:
      return (
        <Textarea
          placeholder="Start typing your note…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-full resize-none border-none shadow-none focus-visible:ring-0 text-base p-6 rounded-none"
        />
      );
  }
}
