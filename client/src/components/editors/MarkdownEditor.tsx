import { useState, useEffect, useRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Columns2, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

// Lightweight markdown renderer — no external dependency needed
function renderMarkdown(md: string): string {
  return md
    // Headings
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    // Bold & italic
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/_(.+?)_/g, "<em>$1</em>")
    // Strikethrough
    .replace(/~~(.+?)~~/g, "<del>$1</del>")
    // Inline code
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    // Code blocks
    .replace(/```[\w]*\n([\s\S]*?)```/g, "<pre><code>$1</code></pre>")
    // Blockquote
    .replace(/^> (.+)$/gm, "<blockquote>$1</blockquote>")
    // Unordered list items
    .replace(/^[-*+] (.+)$/gm, "<li>$1</li>")
    // Ordered list items
    .replace(/^\d+\. (.+)$/gm, "<li>$1</li>")
    // Horizontal rule
    .replace(/^---$/gm, "<hr />")
    // Links
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    // Paragraphs — wrap lines that aren't already HTML tags
    .split("\n")
    .map((line) => {
      if (line.trim() === "") return "";
      if (/^<(h[1-6]|li|pre|blockquote|hr)/.test(line.trim())) return line;
      return `<p>${line}</p>`;
    })
    .join("\n");
}

interface MarkdownEditorProps {
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
}

export function MarkdownEditor({ value, onChange, placeholder }: MarkdownEditorProps) {
  const [splitView, setSplitView] = useState(true);
  const previewRef = useRef<HTMLDivElement>(null);

  const html = renderMarkdown(value);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-1 border-b bg-muted/30 px-3 py-1">
        <span className="text-xs text-muted-foreground mr-2">Markdown</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          title="Toggle split view"
          onClick={() => setSplitView((v) => !v)}
          className={cn("h-7 px-2 text-xs gap-1", splitView && "bg-accent")}
        >
          {splitView ? <Columns2 className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
          {splitView ? "Split" : "Edit only"}
        </Button>
      </div>

      <div className={cn("flex-1 flex overflow-hidden", splitView && "divide-x")}>
        {/* Editor pane */}
        <div className={cn("flex flex-col", splitView ? "w-1/2" : "w-full")}>
          <Textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder ?? "# My Note\n\nStart writing in **Markdown**..."}
            className="flex-1 resize-none border-none shadow-none focus-visible:ring-0 rounded-none font-mono text-sm p-4 h-full"
          />
        </div>

        {/* Preview pane */}
        {splitView && (
          <div
            ref={previewRef}
            className="w-1/2 overflow-y-auto p-4 prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: html || "<p class='text-muted-foreground text-sm'>Preview will appear here…</p>" }}
          />
        )}
      </div>
    </div>
  );
}
