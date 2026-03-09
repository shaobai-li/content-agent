"use client";

import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import type { EditorState } from "lexical";
import {
  BeautifulMentionNode,
  BeautifulMentionsPlugin,
  type BeautifulMentionsTheme,
} from "lexical-beautiful-mentions";
import { fetchKbRecords } from "@/shared/api/records";
import { cn } from "@/shared/lib/cn";

const beautifulMentionsTheme: BeautifulMentionsTheme = {
  "@": "px-1.5 py-0.5 mx-px rounded bg-primary/10 text-primary text-[11px] font-medium",
  "@Focused": "outline-none ring-1 ring-primary/30",
};

const editorTheme = {
  paragraph: "m-0",
  text: "text-sm",
  beautifulMentions: beautifulMentionsTheme,
};

function onError(error: Error) {
  console.error("Lexical editor error:", error);
}

export interface LexicalEditorProps {
  className?: string;
  placeholder?: string;
  onChange?: (editorState: EditorState) => void;
  editable?: boolean;
}

export function LexicalEditor({
  className,
  placeholder = "Type messages ...",
  onChange,
  editable = true,
}: LexicalEditorProps) {
  const initialConfig = {
    namespace: "ChatLexicalEditor",
    theme: editorTheme,
    onError,
    editable,
    nodes: [BeautifulMentionNode],
  };

  const handleSearch = async (_trigger: string, query: string | null) => {
    try {
      const response = await fetchKbRecords();
      const records = (response as { records?: Array<{ record_id: string; name: string; parsed_path?: string }> })
        .records || [];
      const q = (query || "").toLowerCase().trim();
      const filtered = q
        ? records.filter((r) => r.name?.toLowerCase().includes(q))
        : records;
      return filtered.map((record) => ({
        value: record.name,
        id: record.record_id,
        parsed_path: record.parsed_path,
      }));
    } catch (err) {
      console.error("Failed to fetch mention options:", err);
      return [];
    }
  };

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className={cn("relative min-h-[24px] flex-1 min-w-[120px]", className)}>
        <RichTextPlugin
          contentEditable={
            <ContentEditable
              className="outline-none min-h-[24px] py-2 px-3 text-sm"
              aria-placeholder={placeholder}
              placeholder={
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none text-sm">
                  {placeholder}
                </div>
              }
            />
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
        <HistoryPlugin />
        {onChange && <OnChangePlugin onChange={onChange} />}
        <BeautifulMentionsPlugin
          triggers={["@"]}
          onSearch={handleSearch}
          creatable={false}
          allowSpaces={false}
        />
      </div>
    </LexicalComposer>
  );
}
