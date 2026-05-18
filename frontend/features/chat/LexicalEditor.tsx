"use client";

import { forwardRef, useEffect, useImperativeHandle } from "react";
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
  useBeautifulMentions,
  type BeautifulMentionsMenuItemProps,
  type BeautifulMentionsMenuProps,
  type BeautifulMentionsTheme,
} from "lexical-beautiful-mentions";
import { fetchKbRecords } from "@/shared/api/records";
import { cn } from "@/shared/lib/cn";
import { BookOpen } from "lucide-react";
import type { MentionItem } from "./MentionChip";

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
      style={{ ...props.style, transform: "translateY(-100%) translateY(-28px)" }}
      className={cn(
        "z-50 m-0 max-h-72 min-w-[260px] overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md",
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
  agentId: string;
}

export interface LexicalEditorHandle {
  insertMention: (mention: MentionItem) => void;
  hasMention: (mention: MentionItem) => boolean;
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

function MentionBridgePlugin({
  refHandle,
}: {
  refHandle: React.ForwardedRef<LexicalEditorHandle>;
}) {
  const [editor] = useLexicalComposerContext();
  const { insertMention } = useBeautifulMentions();

  useImperativeHandle(
    refHandle,
    () => ({
      insertMention: (mention) => {
        editor.focus();
        editor.update(() => {
          $getRoot().selectEnd();
        });
        insertMention({
          trigger: "@",
          value: mention.name,
          data: {
            id: mention.id,
            kind: mention.kind ?? null,
            kbId: mention.kbId ?? null,
            nodeId: mention.nodeId ?? null,
            recordId: mention.recordId ?? null,
            parsed_path: mention.parsed_path ?? null,
          },
        });
      },
      hasMention: (mention) => {
        const editorState = editor.getEditorState().toJSON() as {
          root?: { children?: unknown[] };
        };
        const nodes = Array.isArray(editorState.root?.children) ? editorState.root.children : [];
        const targetKind = mention.kind || "record";

        const visit = (items: unknown[]): boolean => {
          for (const item of items) {
            if (!item || typeof item !== "object") {
              continue;
            }

            const node = item as {
              type?: string;
              data?: { id?: string; kind?: "database" | "folder" | "record" };
              children?: unknown[];
            };

            if (
              node.type === "beautifulMention" &&
              node.data?.id === mention.id &&
              (node.data?.kind || "record") === targetKind
            ) {
              return true;
            }

            if (Array.isArray(node.children) && visit(node.children)) {
              return true;
            }
          }

          return false;
        };

        return visit(nodes);
      },
    }),
    [editor, insertMention],
  );

  return null;
}

export const LexicalEditor = forwardRef<LexicalEditorHandle, LexicalEditorProps>(function LexicalEditor({
  className,
  placeholder = "Type messages ...",
  onChange,
  value = "",
  onEnter,
  editable = true,
  agentId,
}, ref) {
  const initialConfig = {
    namespace: "ChatLexicalEditor",
    theme: editorTheme,
    onError,
    editable,
    nodes: [BeautifulMentionNode],
  };

  const handleSearch = async (_trigger: string, query?: string | null) => {
    try {
      const response = await fetchKbRecords(agentId);
      const records = (response as {
        nodes?: Array<{ id?: string; record_id?: string; name?: string; parsed_path?: string }>;
      })
        .nodes || [];
      const q = (query || "").toLowerCase().trim();
      const filtered = q
        ? records.filter((r) => r.name?.toLowerCase().includes(q))
        : records;
      return filtered.map((record) => ({
        value: String(record.name || ""),
        kind: "record" as const,
        id: String(record.record_id || record.id || ""),
        ...(record.id ? { nodeId: record.id } : {}),
        ...(record.record_id ? { recordId: record.record_id } : {}),
        ...(record.parsed_path ? { parsed_path: record.parsed_path } : {}),
      })).filter((record) => record.value && record.id);
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
        <MentionBridgePlugin refHandle={ref} />
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
});
