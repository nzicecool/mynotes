import { useAuth } from "@/_core/hooks/useAuth";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { hasEncryptionKey, encrypt, decrypt, getEncryptionKey, clearEncryptionKey } from "@/lib/encryption";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { 
  Plus, 
  Search, 
  FileText, 
  Pin, 
  Archive, 
  Trash2, 
  LogOut, 
  Lock,
  Save,
  X,
  StickyNote
} from "lucide-react";

type NoteType = "plain" | "rich" | "markdown" | "checklist" | "code" | "spreadsheet";

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [selectedNoteId, setSelectedNoteId] = useState<number | null>(null);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [noteType, setNoteType] = useState<NoteType>("plain");
  const [searchQuery, setSearchQuery] = useState("");
  const [isEditing, setIsEditing] = useState(false);

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

  const handleCreateNote = async () => {
    if (!noteContent.trim()) {
      toast.error("Note content cannot be empty");
      return;
    }

    const key = getEncryptionKey();
    if (!key) {
      toast.error("Encryption key not available");
      return;
    }

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
    if (!selectedNoteId || !noteContent.trim()) return;

    const key = getEncryptionKey();
    if (!key) {
      toast.error("Encryption key not available");
      return;
    }

    try {
      const encryptedContent = await encrypt(noteContent, key);
      await updateNoteMutation.mutateAsync({
        id: selectedNoteId,
        title: noteTitle || "Untitled",
        encryptedContent,
      });

      toast.success("Note updated");
      refetchNotes();
    } catch (error) {
      console.error("Update note error:", error);
      toast.error("Failed to update note");
    }
  };

  const handleSelectNote = async (noteId: number) => {
    const note = notes.find((n) => n.id === noteId);
    if (!note) return;

    const key = getEncryptionKey();
    if (!key) {
      toast.error("Encryption key not available");
      return;
    }

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

  const handleDeleteNote = async (noteId: number) => {
    if (!confirm("Are you sure you want to delete this note?")) return;

    try {
      await deleteNoteMutation.mutateAsync({ id: noteId });
      toast.success("Note deleted");
      
      if (selectedNoteId === noteId) {
        setSelectedNoteId(null);
        setNoteTitle("");
        setNoteContent("");
      }
      
      refetchNotes();
    } catch (error) {
      console.error("Delete note error:", error);
      toast.error("Failed to delete note");
    }
  };

  const handleNewNote = () => {
    setSelectedNoteId(null);
    setNoteTitle("");
    setNoteContent("");
    setNoteType("plain");
    setIsEditing(true);
  };

  const handleLogout = async () => {
    clearEncryptionKey();
    // Use local auth logout endpoint directly
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
    window.location.href = "/login";
  };

  const filteredNotes = notes.filter((note) =>
    (note.title?.toLowerCase() || "").includes(searchQuery.toLowerCase())
  );

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="border-b bg-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
            <StickyNote className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">MyNotes</h1>
            <p className="text-sm text-muted-foreground">Secure & Encrypted</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{user?.name}</span>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - Notes List */}
        <aside className="w-80 border-r bg-gray-50 flex flex-col">
          <div className="p-4 space-y-3">
            <Button className="w-full" onClick={handleNewNote}>
              <Plus className="w-4 h-4 mr-2" />
              New Note
            </Button>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search notes..."
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {filteredNotes.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No notes yet</p>
                  <p className="text-sm">Create your first note</p>
                </div>
              ) : (
                filteredNotes.map((note) => (
                  <Card
                    key={note.id}
                    className={`cursor-pointer hover:bg-accent transition-colors ${
                      selectedNoteId === note.id ? "bg-accent border-indigo-200" : ""
                    }`}
                    onClick={() => handleSelectNote(note.id)}
                  >
                    <CardHeader className="p-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-sm font-medium truncate">
                            {note.title || "Untitled"}
                          </CardTitle>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="secondary" className="text-xs">
                              {note.noteType}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {new Date(note.updatedAt).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteNote(note.id);
                          }}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </CardHeader>
                  </Card>
                ))
              )}
            </div>
          </ScrollArea>
        </aside>

        {/* Main Editor */}
        <main className="flex-1 flex flex-col bg-white">
          {selectedNoteId || isEditing ? (
            <div className="flex-1 flex flex-col">
              <div className="border-b px-6 py-4 flex items-center justify-between">
                <Input
                  placeholder="Note title..."
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
                  className="text-lg font-medium border-none shadow-none focus-visible:ring-0 px-0"
                />
                <div className="flex items-center gap-2">
                  <Button
                    variant="default"
                    size="sm"
                    onClick={selectedNoteId ? handleUpdateNote : handleCreateNote}
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {selectedNoteId ? "Save" : "Create"}
                  </Button>
                  {isEditing && !selectedNoteId && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setIsEditing(false);
                        setNoteTitle("");
                        setNoteContent("");
                      }}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>

              <div className="flex-1 p-6">
                <Textarea
                  placeholder="Start typing your note..."
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  className="w-full h-full resize-none border-none shadow-none focus-visible:ring-0 text-base"
                />
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <Lock className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg">Select a note or create a new one</p>
                <p className="text-sm mt-2">Your notes are encrypted and secure</p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
