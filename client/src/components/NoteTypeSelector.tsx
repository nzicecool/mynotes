import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FileText, Bold, Hash, CheckSquare, Code2, Table2 } from "lucide-react";

export type NoteType = "plain" | "rich" | "markdown" | "checklist" | "code" | "spreadsheet";

interface NoteTypeMeta {
  type: NoteType;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

export const NOTE_TYPES: NoteTypeMeta[] = [
  {
    type: "plain",
    label: "Plain Text",
    description: "Simple text note",
    icon: FileText,
    color: "text-gray-600",
  },
  {
    type: "rich",
    label: "Rich Text",
    description: "Bold, italic, lists & more",
    icon: Bold,
    color: "text-blue-600",
  },
  {
    type: "markdown",
    label: "Markdown",
    description: "Write in Markdown with live preview",
    icon: Hash,
    color: "text-purple-600",
  },
  {
    type: "checklist",
    label: "Checklist",
    description: "Interactive to-do list",
    icon: CheckSquare,
    color: "text-green-600",
  },
  {
    type: "code",
    label: "Code",
    description: "Syntax-highlighted code snippet",
    icon: Code2,
    color: "text-orange-600",
  },
  {
    type: "spreadsheet",
    label: "Spreadsheet",
    description: "Simple rows & columns grid",
    icon: Table2,
    color: "text-teal-600",
  },
];

interface NoteTypeSelectorProps {
  value: NoteType;
  onChange: (type: NoteType) => void;
  disabled?: boolean;
}

export function NoteTypeSelector({ value, onChange, disabled }: NoteTypeSelectorProps) {
  return (
    <div className="grid grid-cols-3 gap-2 p-4">
      {NOTE_TYPES.map(({ type, label, description, icon: Icon, color }) => (
        <button
          key={type}
          disabled={disabled}
          onClick={() => onChange(type)}
          className={cn(
            "flex flex-col items-center gap-1.5 rounded-lg border p-3 text-center transition-all hover:bg-accent",
            value === type
              ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500"
              : "border-border bg-background",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        >
          <Icon className={cn("w-5 h-5", color)} />
          <span className="text-xs font-medium leading-tight">{label}</span>
          <span className="text-[10px] text-muted-foreground leading-tight">{description}</span>
        </button>
      ))}
    </div>
  );
}

/** Compact inline badge showing the current type — used in the editor toolbar */
export function NoteTypeBadge({ type }: { type: NoteType }) {
  const meta = NOTE_TYPES.find((t) => t.type === type);
  if (!meta) return null;
  const Icon = meta.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium", meta.color)}>
      <Icon className="w-3.5 h-3.5" />
      {meta.label}
    </span>
  );
}
