import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";

export type SpreadsheetData = string[][];

const DEFAULT_ROWS = 5;
const DEFAULT_COLS = 4;

export function serializeSpreadsheet(data: SpreadsheetData): string {
  return JSON.stringify(data);
}

export function deserializeSpreadsheet(raw: string): SpreadsheetData {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every(Array.isArray)) {
      return parsed as SpreadsheetData;
    }
  } catch {
    // Legacy fallback: treat as CSV-ish
  }
  // Return a blank default grid
  return Array.from({ length: DEFAULT_ROWS }, () => Array(DEFAULT_COLS).fill(""));
}

function colLabel(index: number): string {
  let label = "";
  let n = index + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}

interface SpreadsheetEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export function SpreadsheetEditor({ value, onChange }: SpreadsheetEditorProps) {
  const [data, setData] = useState<SpreadsheetData>(() => deserializeSpreadsheet(value));
  const [activeCell, setActiveCell] = useState<[number, number] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setData(deserializeSpreadsheet(value));
  }, [value]);

  const update = (updated: SpreadsheetData) => {
    setData(updated);
    onChange(serializeSpreadsheet(updated));
  };

  const setCellValue = (row: number, col: number, val: string) => {
    const next = data.map((r, ri) =>
      ri === row ? r.map((c, ci) => (ci === col ? val : c)) : r
    );
    update(next);
  };

  const addRow = () => {
    const cols = data[0]?.length ?? DEFAULT_COLS;
    update([...data, Array(cols).fill("")]);
  };

  const addCol = () => {
    update(data.map((row) => [...row, ""]));
  };

  const deleteRow = (rowIndex: number) => {
    if (data.length <= 1) return;
    update(data.filter((_, i) => i !== rowIndex));
  };

  const deleteCol = (colIndex: number) => {
    if ((data[0]?.length ?? 0) <= 1) return;
    update(data.map((row) => row.filter((_, i) => i !== colIndex)));
  };

  const rows = data.length;
  const cols = data[0]?.length ?? DEFAULT_COLS;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-1.5">
        <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={addRow}>
          <Plus className="w-3 h-3" /> Row
        </Button>
        <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={addCol}>
          <Plus className="w-3 h-3" /> Column
        </Button>
        <span className="text-xs text-muted-foreground ml-2">
          {rows} × {cols}
        </span>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto p-2">
        <table className="border-collapse text-sm w-full">
          <thead>
            <tr>
              {/* Row number header corner */}
              <th className="w-8 min-w-[2rem] border bg-muted text-muted-foreground text-xs font-normal p-1" />
              {Array.from({ length: cols }, (_, ci) => (
                <th
                  key={ci}
                  className="border bg-muted text-muted-foreground text-xs font-medium p-1 min-w-[100px] group"
                >
                  <div className="flex items-center justify-between">
                    <span className="flex-1 text-center">{colLabel(ci)}</span>
                    {cols > 1 && (
                      <button
                        type="button"
                        onClick={() => deleteCol(ci)}
                        className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive/80 ml-1"
                        title="Delete column"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, ri) => (
              <tr key={ri} className="group/row">
                {/* Row number */}
                <td className="border bg-muted text-muted-foreground text-xs text-center p-1 w-8">
                  <div className="flex items-center justify-between gap-0.5">
                    <span>{ri + 1}</span>
                    {rows > 1 && (
                      <button
                        type="button"
                        onClick={() => deleteRow(ri)}
                        className="opacity-0 group-hover/row:opacity-100 text-destructive hover:text-destructive/80"
                        title="Delete row"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </td>
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    className={`border p-0 min-w-[100px] ${
                      activeCell?.[0] === ri && activeCell?.[1] === ci
                        ? "ring-2 ring-inset ring-indigo-500"
                        : ""
                    }`}
                    onClick={() => setActiveCell([ri, ci])}
                  >
                    <input
                      ref={activeCell?.[0] === ri && activeCell?.[1] === ci ? inputRef : undefined}
                      value={cell}
                      onChange={(e) => setCellValue(ri, ci, e.target.value)}
                      onFocus={() => setActiveCell([ri, ci])}
                      className="w-full h-full px-2 py-1 bg-transparent focus:outline-none text-sm"
                      onKeyDown={(e) => {
                        if (e.key === "Tab") {
                          e.preventDefault();
                          const nextCol = ci + 1 < cols ? ci + 1 : 0;
                          const nextRow = ci + 1 < cols ? ri : ri + 1 < rows ? ri + 1 : ri;
                          setActiveCell([nextRow, nextCol]);
                        } else if (e.key === "Enter") {
                          e.preventDefault();
                          if (ri + 1 < rows) setActiveCell([ri + 1, ci]);
                        }
                      }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
