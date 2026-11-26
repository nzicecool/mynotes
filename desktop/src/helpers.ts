import type { DesktopNote, NoteType } from "./types";

export type NoteFilter = "all" | "pinned" | "archived" | "trash";

/** PINs are strings: leading zeroes are meaningful and must never be coerced. */
export function validatePin(pin: string, confirmation?: string): string | null {
  if (!/^[0-9]{6,}$/.test(pin)) return "Use at least 6 digits (0–9). Spaces and other characters are not allowed.";
  if (confirmation !== undefined && pin !== confirmation) return "The PINs do not match.";
  return null;
}

export function parseTags(value: string): string[] {
  return [...new Set(value.split(",").map(tag => tag.trim()).filter(Boolean))];
}

export function matchesFilter(note: DesktopNote, filter: NoteFilter): boolean {
  if (filter === "trash") return note.trashed;
  if (note.trashed) return false;
  if (filter === "archived") return note.archived;
  if (note.archived) return false;
  return filter === "pinned" ? note.pinned : true;
}

export function searchNotes(notes: DesktopNote[], filter: NoteFilter, query: string): DesktopNote[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return notes.filter(note => {
    if (!matchesFilter(note, filter)) return false;
    const haystack = [note.title, note.content, ...note.tags].join("\n").toLocaleLowerCase();
    return terms.every(term => haystack.includes(term));
  }).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
}

export const NOTE_TYPES: { value: NoteType; label: string; detail: string }[] = [
  { value: "plain", label: "Plain text", detail: "A clean page for your thoughts" },
  { value: "rich", label: "Rich text", detail: "Headings, formatting and lists" },
  { value: "markdown", label: "Markdown", detail: "Write with a side-by-side preview" },
  { value: "checklist", label: "Checklist", detail: "Small steps, checked off" },
  { value: "code", label: "Code", detail: "Snippets with a language label" },
  { value: "spreadsheet", label: "Spreadsheet", detail: "A lightweight editable grid" },
];

export function initialContent(type: NoteType): string {
  if (type === "checklist") return "[]";
  if (type === "code") return JSON.stringify({ language: "plaintext", code: "" });
  if (type === "spreadsheet") return JSON.stringify(Array.from({ length: 5 }, () => Array(4).fill("")));
  return "";
}

export function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "The operation could not be completed. Please try again.";
}
