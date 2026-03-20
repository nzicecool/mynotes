/**
 * Tests for editor serialization/deserialization utilities.
 * These are pure functions so they can be tested without a DOM.
 */
import { describe, it, expect } from "vitest";

// ─── Checklist helpers (copied from ChecklistEditor.tsx) ──────────────────────

interface ChecklistItem {
  id: string;
  text: string;
  checked: boolean;
}

function serializeChecklist(items: ChecklistItem[]): string {
  return JSON.stringify(items);
}

function deserializeChecklist(raw: string): ChecklistItem[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as ChecklistItem[];
  } catch {
    if (raw.trim()) {
      return raw.split("\n").filter(Boolean).map((line, i) => ({
        id: `item-${i}`,
        text: line.replace(/^\[[ x]\] /, ""),
        checked: line.startsWith("[x] "),
      }));
    }
  }
  return [];
}

// ─── Code helpers (copied from CodeEditor.tsx) ───────────────────────────────

interface CodeNoteContent {
  language: string;
  code: string;
}

function serializeCode(content: CodeNoteContent): string {
  return JSON.stringify(content);
}

function deserializeCode(raw: string): CodeNoteContent {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.code === "string") return parsed as CodeNoteContent;
  } catch {
    // legacy fallback
  }
  return { language: "plaintext", code: raw };
}

// ─── Spreadsheet helpers (copied from SpreadsheetEditor.tsx) ─────────────────

type SpreadsheetData = string[][];

function serializeSpreadsheet(data: SpreadsheetData): string {
  return JSON.stringify(data);
}

function deserializeSpreadsheet(raw: string): SpreadsheetData {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every(Array.isArray)) {
      return parsed as SpreadsheetData;
    }
  } catch {
    // fallback
  }
  return Array.from({ length: 5 }, () => Array(4).fill(""));
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("ChecklistEditor serialization", () => {
  it("round-trips an array of items", () => {
    const items: ChecklistItem[] = [
      { id: "1", text: "Buy milk", checked: false },
      { id: "2", text: "Write tests", checked: true },
    ];
    const serialized = serializeChecklist(items);
    const deserialized = deserializeChecklist(serialized);
    expect(deserialized).toEqual(items);
  });

  it("returns empty array for empty string", () => {
    expect(deserializeChecklist("")).toEqual([]);
  });

  it("returns a single-item array for invalid JSON via legacy fallback", () => {
    // The function falls back to line-splitting for non-parseable strings
    const result = deserializeChecklist("{not valid json}");
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("{not valid json}");
    expect(result[0].checked).toBe(false);
  });

  it("handles legacy plain-text fallback", () => {
    const raw = "[x] Done item\n[ ] Pending item";
    const items = deserializeChecklist(raw);
    expect(items).toHaveLength(2);
    expect(items[0].checked).toBe(true);
    expect(items[0].text).toBe("Done item");
    expect(items[1].checked).toBe(false);
    expect(items[1].text).toBe("Pending item");
  });
});

describe("CodeEditor serialization", () => {
  it("round-trips code content", () => {
    const content: CodeNoteContent = { language: "typescript", code: "const x = 42;" };
    const serialized = serializeCode(content);
    const deserialized = deserializeCode(serialized);
    expect(deserialized).toEqual(content);
  });

  it("falls back to plaintext for non-JSON input", () => {
    const raw = "print('hello')";
    const result = deserializeCode(raw);
    expect(result.language).toBe("plaintext");
    expect(result.code).toBe(raw);
  });

  it("falls back to plaintext for JSON without code field", () => {
    const raw = JSON.stringify({ language: "python" });
    const result = deserializeCode(raw);
    expect(result.language).toBe("plaintext");
  });
});

describe("SpreadsheetEditor serialization", () => {
  it("round-trips a 2D array", () => {
    const data: SpreadsheetData = [
      ["Name", "Age", "City"],
      ["Alice", "30", "Sydney"],
      ["Bob", "25", "Melbourne"],
    ];
    const serialized = serializeSpreadsheet(data);
    const deserialized = deserializeSpreadsheet(serialized);
    expect(deserialized).toEqual(data);
  });

  it("returns a default 5×4 grid for invalid input", () => {
    const result = deserializeSpreadsheet("not json");
    expect(result).toHaveLength(5);
    expect(result[0]).toHaveLength(4);
  });

  it("returns a default grid for non-2D JSON", () => {
    const result = deserializeSpreadsheet(JSON.stringify({ rows: 3 }));
    expect(result).toHaveLength(5);
  });
});
