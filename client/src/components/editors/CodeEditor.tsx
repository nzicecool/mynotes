import { useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";

const LANGUAGES = [
  "plaintext", "javascript", "typescript", "python", "java", "c", "cpp",
  "csharp", "go", "rust", "ruby", "php", "swift", "kotlin", "sql",
  "html", "css", "json", "yaml", "bash", "markdown",
];

export interface CodeNoteContent {
  language: string;
  code: string;
}

export function serializeCode(content: CodeNoteContent): string {
  return JSON.stringify(content);
}

export function deserializeCode(raw: string): CodeNoteContent {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.code === "string") return parsed as CodeNoteContent;
  } catch {
    // Legacy plain text fallback
  }
  return { language: "plaintext", code: raw };
}

interface CodeEditorProps {
  value: string; // JSON-serialized CodeNoteContent
  onChange: (value: string) => void;
}

export function CodeEditor({ value, onChange }: CodeEditorProps) {
  const [content, setContent] = useState<CodeNoteContent>(() => deserializeCode(value));
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setContent(deserializeCode(value));
  }, [value]);

  const update = (updated: CodeNoteContent) => {
    setContent(updated);
    onChange(serializeCode(updated));
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-1.5">
        <span className="text-xs text-muted-foreground">Language:</span>
        <Select
          value={content.language}
          onValueChange={(lang) => update({ ...content, language: lang })}
        >
          <SelectTrigger className="h-7 w-36 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LANGUAGES.map((lang) => (
              <SelectItem key={lang} value={lang} className="text-xs">
                {lang}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs gap-1"
          onClick={handleCopy}
        >
          {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? "Copied!" : "Copy"}
        </Button>
      </div>

      {/* Code textarea */}
      <div className="flex-1 relative overflow-hidden">
        <textarea
          value={content.code}
          onChange={(e) => update({ ...content, code: e.target.value })}
          placeholder={`// Write your ${content.language} code here…`}
          spellCheck={false}
          className="absolute inset-0 w-full h-full resize-none border-none bg-gray-950 text-green-400 font-mono text-sm p-4 focus:outline-none"
          style={{ tabSize: 2 }}
          onKeyDown={(e) => {
            // Insert 2-space indent on Tab key
            if (e.key === "Tab") {
              e.preventDefault();
              const el = e.currentTarget;
              const start = el.selectionStart;
              const end = el.selectionEnd;
              const newCode = content.code.substring(0, start) + "  " + content.code.substring(end);
              update({ ...content, code: newCode });
              requestAnimationFrame(() => {
                el.selectionStart = el.selectionEnd = start + 2;
              });
            }
          }}
        />
      </div>
    </div>
  );
}
