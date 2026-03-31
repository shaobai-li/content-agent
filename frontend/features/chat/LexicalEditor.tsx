"use client";

import { forwardRef, useEffect } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  COMMAND_PRIORITY_LOW,
  KEY_ENTER_COMMAND,
  type EditorState,
} from "lexical";
import {
  BeautifulMentionNode,
  BeautifulMentionsPlugin,
  type BeautifulMentionsMenuItemProps,
  type BeautifulMentionsMenuProps,
  type BeautifulMentionsTheme,
} from "lexical-beautiful-mentions";
import { fetchKbRecords } from "@/shared/api/records";
import { cn } from "@/shared/lib/cn";
import { BookOpen } from "lucide-react";

const beautifulMentionsTheme: BeautifulMentionsTheme = {
  "@": "px-1.5 py-0.5 mx-px rounded bg-primary/10 text-primary text-[11px] font-medium",
  "@Focused": "outline-none ring-1 ring-primary/30",
};

const editorTheme = {
  paragraph: "m-0",
  beautifulMentions: beautifulMentionsTheme,
};

function MentionMenu({ loading, ...props }: BeautifulMentionsMenuProps) {
  return (
    <ul
      {...props}
      className={cn(
        "z-50 m-0 mt-2 max-h-72 min-w-[260px] overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md",
        props.className
      )}
    >
      {loading && <li className="px-2 py-1.5 text-sm text-muted-foreground">Loading...</li>}
      {props.children}
    </ul>
  );
}

const MentionMenuItem = forwardRef<HTMLLIElement, BeautifulMentionsMenuItemProps>(
  ({ selected, item, ...props }, ref) => (
    <li
      {...props}
      ref={ref}
      className={cn(
        "relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden",
        selected && "bg-accent text-accent-foreground",
        !selected && "text-foreground",
        props.className
      )}
    >
      <BookOpen className="size-4 shrink-0 text-muted-foreground" />
      <span className="truncate" title={item.value}>
        {item.value}
      </span>
    </li>
  )
);
MentionMenuItem.displayName = "MentionMenuItem";

function MentionEmpty() {
  return <div className="px-2 py-6 text-center text-sm text-muted-foreground">No articles available</div>;
}

function onError(error: Error) {
  console.error("Lexical editor error:", error);
}

export interface LexicalEditorProps {
  className?: string;
  placeholder?: string;
  onChange?: (editorState: EditorState) => void;
  value?: string;
  onEnter?: () => void;
  editable?: boolean;
}

function SyncExternalValuePlugin({ value }: { value: string }) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const currentText = editor.getEditorState().read(() => $getRoot().getTextContent());
    if (currentText === value) {
      return;
    }

    editor.update(() => {
      const root = $getRoot();
      root.clear();
      const paragraph = $createParagraphNode();
      if (value) {
        paragraph.append($createTextNode(value));
      }
      root.append(paragraph);
    });
  }, [editor, value]);

  return null;
}

function EnterSendPlugin({ onEnter }: { onEnter?: () => void }) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!onEnter) {
      return;
    }

    return editor.registerCommand(
      KEY_ENTER_COMMAND,
      (event) => {
        if (event?.shiftKey) {
          return false;
        }
        event?.preventDefault();
        onEnter();
        return true;
      },
      COMMAND_PRIORITY_LOW
    );
  }, [editor, onEnter]);

  return null;
}

export function LexicalEditor({
  className,
  placeholder = "Type messages ...",
  onChange,
  value = "",
  onEnter,
  editable = true,
}: LexicalEditorProps) {
  const initialConfig = {
    namespace: "ChatLexicalEditor",
    theme: editorTheme,
    onError,
    editable,
    nodes: [BeautifulMentionNode],
  };

  const handleSearch = async (_trigger: string, query?: string | null) => {
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
        ...(record.parsed_path ? { parsed_path: record.parsed_path } : {}),
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
        <SyncExternalValuePlugin value={value} />
        <EnterSendPlugin onEnter={onEnter} />
        <BeautifulMentionsPlugin
          triggers={["@"]}
          onSearch={handleSearch}
          creatable={false}
          allowSpaces={false}
          menuComponent={MentionMenu}
          menuItemComponent={MentionMenuItem}
          emptyComponent={MentionEmpty}
        />
      </div>
    </LexicalComposer>
  );
}
