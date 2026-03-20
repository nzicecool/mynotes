import { useAuth } from "@/_core/hooks/useAuth";
import { useEffect, useState } from "react";
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
  ChevronRight,
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

export default function Dashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  // Editor state
  const [selectedNoteId, setSelectedNoteId] = useState<number | null>(null);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [noteType, setNoteType] = useState<NoteType>("plain");
  const [isEditing, setIsEditing] = useState(false);

  // UI state
  const [searchQuery, setSearchQuery] = useState("");
  const [showTypeDialog, setShowTypeDialog] = useState(false);
  const [pendingType, setPendingType] = useState<NoteType>("plain");

  // Data
  const { data: notes = [], refetch: refetchNotes } = trpc.notes.list.useQuery();
  const createNoteMutation = trpc.notes.create.useMutation();
  const updateNoteMutation = trpc.notes.update.useMutation();
  const deleteNoteMutation = trpc.notes.delete.useMutation();

  // Redirect if no encryption key
  useEffect(() => {
    if (!hasEncryptionKey()) {
      setLocation("/setup");
    }
  }, [setLocation]);

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
      toast.success("Note saved");
      refetchNotes();
    } catch (error) {
      console.error("Update note error:", error);
      toast.error("Failed to save note");
    }
  };

  const handleSelectNote = async (noteId: number) => {
    const note = notes.find((n) => n.id === noteId);
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
        setIsEditing(false);
      }
      refetchNotes();
    } catch (error) {
      console.error("Delete note error:", error);
      toast.error("Failed to delete note");
    }
  };

  const handleLogout = async () => {
    clearEncryptionKey();
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
    window.location.href = "/login";
  };

  const handleCancel = () => {
    setIsEditing(false);
    setSelectedNoteId(null);
    setNoteTitle("");
    setNoteContent("");
  };

  // ─── Derived ─────────────────────────────────────────────────────────────────

  const filteredNotes = notes.filter((note) =>
    (note.title?.toLowerCase() || "").includes(searchQuery.toLowerCase())
  );

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

          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {filteredNotes.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <FileText className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No notes yet</p>
                  <p className="text-xs mt-1">Click "New Note" to get started</p>
                </div>
              ) : (
                filteredNotes.map((note) => {
                  const typeMeta = NOTE_TYPES.find((t) => t.type === note.noteType);
                  const Icon = typeMeta?.icon ?? FileText;
                  return (
                    <button
                      key={note.id}
                      onClick={() => handleSelectNote(note.id)}
                      className={`w-full text-left rounded-lg px-3 py-2.5 transition-colors group flex items-start gap-2.5 ${
                        selectedNoteId === note.id
                          ? "bg-indigo-50 border border-indigo-200"
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
                    </button>
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
                  onChange={(e) => setNoteTitle(e.target.value)}
                  className="flex-1 text-base font-medium border-none shadow-none focus-visible:ring-0 px-0 h-8"
                />
                <div className="flex items-center gap-2 shrink-0">
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

              {/* Editor body */}
              <div className="flex-1 overflow-hidden">
                <NoteEditor
                  type={noteType}
                  value={noteContent}
                  onChange={setNoteContent}
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
