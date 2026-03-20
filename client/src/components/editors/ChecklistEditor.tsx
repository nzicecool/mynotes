import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, GripVertical } from "lucide-react";

export interface ChecklistItem {
  id: string;
  text: string;
  checked: boolean;
}

/** Serialize checklist items to a JSON string for storage */
export function serializeChecklist(items: ChecklistItem[]): string {
  return JSON.stringify(items);
}

/** Deserialize JSON string back to checklist items */
export function deserializeChecklist(raw: string): ChecklistItem[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as ChecklistItem[];
  } catch {
    // Legacy plain-text fallback: treat each line as an unchecked item
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

function generateId() {
  return `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

interface ChecklistEditorProps {
  value: string; // JSON-serialized ChecklistItem[]
  onChange: (value: string) => void;
}

export function ChecklistEditor({ value, onChange }: ChecklistEditorProps) {
  const [items, setItems] = useState<ChecklistItem[]>(() => deserializeChecklist(value));
  const [newItemText, setNewItemText] = useState("");

  // Sync inbound value (e.g. when loading a saved note)
  useEffect(() => {
    setItems(deserializeChecklist(value));
  }, [value]);

  const update = (updated: ChecklistItem[]) => {
    setItems(updated);
    onChange(serializeChecklist(updated));
  };

  const toggleItem = (id: string) => {
    update(items.map((item) => (item.id === id ? { ...item, checked: !item.checked } : item)));
  };

  const editItem = (id: string, text: string) => {
    update(items.map((item) => (item.id === id ? { ...item, text } : item)));
  };

  const deleteItem = (id: string) => {
    update(items.filter((item) => item.id !== id));
  };

  const addItem = () => {
    const text = newItemText.trim();
    if (!text) return;
    update([...items, { id: generateId(), text, checked: false }]);
    setNewItemText("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") addItem();
  };

  const pending = items.filter((i) => !i.checked);
  const done = items.filter((i) => i.checked);

  return (
    <div className="flex flex-col gap-4 p-4 h-full overflow-y-auto">
      {/* Add new item */}
      <div className="flex gap-2">
        <Input
          placeholder="Add a new item and press Enter…"
          value={newItemText}
          onChange={(e) => setNewItemText(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1"
        />
        <Button type="button" size="sm" onClick={addItem} disabled={!newItemText.trim()}>
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      {items.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">
          No items yet. Add your first task above.
        </p>
      )}

      {/* Pending items */}
      {pending.length > 0 && (
        <div className="space-y-1">
          {pending.map((item) => (
            <ChecklistRow
              key={item.id}
              item={item}
              onToggle={toggleItem}
              onEdit={editItem}
              onDelete={deleteItem}
            />
          ))}
        </div>
      )}

      {/* Completed items */}
      {done.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wide">
            Completed ({done.length})
          </p>
          <div className="space-y-1 opacity-60">
            {done.map((item) => (
              <ChecklistRow
                key={item.id}
                item={item}
                onToggle={toggleItem}
                onEdit={editItem}
                onDelete={deleteItem}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ChecklistRow({
  item,
  onToggle,
  onEdit,
  onDelete,
}: {
  item: ChecklistItem;
  onToggle: (id: string) => void;
  onEdit: (id: string, text: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 group rounded-md px-2 py-1 hover:bg-muted/50">
      <GripVertical className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 cursor-grab" />
      <Checkbox
        checked={item.checked}
        onCheckedChange={() => onToggle(item.id)}
        id={item.id}
      />
      <Input
        value={item.text}
        onChange={(e) => onEdit(item.id, e.target.value)}
        className={`flex-1 border-none shadow-none focus-visible:ring-0 px-1 h-7 text-sm ${
          item.checked ? "line-through text-muted-foreground" : ""
        }`}
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
        onClick={() => onDelete(item.id)}
      >
        <Trash2 className="w-3 h-3 text-destructive" />
      </Button>
    </div>
  );
}
