import { describe, expect, it } from "vitest";
import { initialContent, matchesFilter, parseTags, searchNotes, validatePin } from "./helpers";
import type { DesktopNote } from "./types";

const note = (patch: Partial<DesktopNote> = {}): DesktopNote => ({ id: "a", title: "Meeting", content: "Plan an offline retreat", noteType: "plain", tags: ["work", "Ideas"], pinned: false, archived: false, trashed: false, createdAt: 1, updatedAt: 2, ...patch });

describe("PIN validation", () => {
  it("accepts six or more digits without losing leading zeros", () => {
    expect(validatePin("000012", "000012")).toBeNull();
    expect(validatePin("01234567890123456789")).toBeNull();
  });
  it.each(["", "12345", "12345a", "123456 ", " 123456", "12 3456", "123.456", "١٢٣٤٥٦", "１２３４５６"])("rejects invalid PIN %j", pin => { expect(validatePin(pin)).not.toBeNull(); });
  it("requires an exact confirmation", () => {
    expect(validatePin("000012", "000013")).toContain("do not match");
    expect(validatePin("000012", "")).not.toBeNull();
  });
});

describe("local search and filters", () => {
  it("searches title, body and encrypted DTO tags case-insensitively with all terms", () => {
    expect(searchNotes([note()], "all", "MEETING offline ideas")).toHaveLength(1);
    expect(searchNotes([note()], "all", "meeting missing")).toHaveLength(0);
  });
  it("separates active, pinned, archived and trashed notes", () => {
    const notes = [note(), note({ id: "b", pinned: true }), note({ id: "c", pinned: true, archived: true }), note({ id: "d", pinned: true, archived: true, trashed: true })];
    expect(searchNotes(notes, "all", "").map(n => n.id)).toEqual(["b", "a"]);
    expect(searchNotes(notes, "pinned", "").map(n => n.id)).toEqual(["b"]);
    expect(searchNotes(notes, "archived", "").map(n => n.id)).toEqual(["c"]);
    expect(searchNotes(notes, "trash", "").map(n => n.id)).toEqual(["d"]);
    expect(matchesFilter(notes[3], "archived")).toBe(false);
  });
  it("sorts pinned first then newest without mutating input", () => {
    const notes = [note({ id: "old", updatedAt: 1 }), note({ id: "new", updatedAt: 8 }), note({ id: "pin", pinned: true, updatedAt: 0 })];
    expect(searchNotes(notes, "all", "  ").map(n => n.id)).toEqual(["pin", "new", "old"]);
    expect(notes.map(n => n.id)).toEqual(["old", "new", "pin"]);
  });
  it("parses comma-separated tags without blank or duplicate entries", () => {
    expect(parseTags(" ideas, work , ideas,,  ")).toEqual(["ideas", "work"]);
  });
  it("initializes structured editors with compatible JSON", () => {
    expect(JSON.parse(initialContent("checklist"))).toEqual([]);
    expect(JSON.parse(initialContent("code"))).toEqual({ language: "plaintext", code: "" });
    expect(JSON.parse(initialContent("spreadsheet"))).toHaveLength(5);
    expect(initialContent("rich")).toBe("");
  });
});
