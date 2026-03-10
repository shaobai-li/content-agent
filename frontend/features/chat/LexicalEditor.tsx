"use client";

import { useEffect, useRef, forwardRef } from "react";
import { $getRoot, $getSelection, $isRangeSelection, $isTextNode } from "lexical";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import type { EditorState } from "lexical";
import { cn } from "@/shared/lib/cn";
import { MentionNode } from "./MentionNode";
import type { MentionItem } from "./MentionChip";
import { $insertMentionFromTrigger } from "./mentionInsert";

const theme = {};

function onError(error: Error) {
  console.error(error);
}

function SyncValuePlugin({ value }: { value: string }) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (value !== "") return;
    editor.getEditorState().read(() => {
      const root = $getRoot();
      if (root.getChildrenSize() > 0) {
        editor.update(() => {
          $getRoot().clear();
        });
      }
    });
  }, [editor, value]);

  return null;
}

function MentionTriggerPlugin({
  onTriggerChange,
}: {
  onTriggerChange: (open: boolean) => void;
}) {
  const [editor] = useLexicalComposerContext();
  const lastOpen = useRef(false);

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        let open = false;
        const sel = $getSelection();
        if ($isRangeSelection(sel) && sel.isCollapsed()) {
          const node = sel.anchor.getNode();
          if ($isTextNode(node)) {
            const before = node.getTextContent().slice(0, sel.anchor.offset);
            open = /@\S*$/.test(before);
          }
        }
        if (open !== lastOpen.current) {
          lastOpen.current = open;
          onTriggerChange(open);
        }
      });
    });
  }, [editor, onTriggerChange]);

  return null;
}

function OnChangeWrapper({ onChange }: { onChange: (value: string) => void }) {
  const handleChange = (editorState: EditorState) => {
    editorState.read(() => {
      onChange($getRoot().getTextContent());
    });
  };
  return <OnChangePlugin onChange={handleChange} />;
}

export interface LexicalEditorHandle {
  insertMention: (item: MentionItem) => void;
}

function ExposeInsertMentionHandle({
  forwardedRef,
}: {
  forwardedRef: React.Ref<LexicalEditorHandle | null>;
}) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    const handle: LexicalEditorHandle = {
      insertMention(item: MentionItem) {
        $insertMentionFromTrigger(editor, item);
      },
    };
    if (typeof forwardedRef === "function") {
      (forwardedRef as (h: LexicalEditorHandle | null) => void)(handle);
      return () => {
        (forwardedRef as (h: LexicalEditorHandle | null) => void)(null);
      };
    }
    if (forwardedRef && typeof forwardedRef === "object" && "current" in forwardedRef) {
      (forwardedRef as React.MutableRefObject<LexicalEditorHandle | null>).current =
        handle;
      return () => {
        (forwardedRef as React.MutableRefObject<LexicalEditorHandle | null>).current =
          null;
      };
    }
  }, [editor, forwardedRef]);
  return null;
}

interface LexicalEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  onMentionTriggerChange?: (open: boolean) => void;
}

const LexicalEditor = forwardRef<LexicalEditorHandle | null, LexicalEditorProps>(
  function LexicalEditor(
    {
      value,
      onChange,
      placeholder = "Type messages ...",
      className,
      onKeyDown,
      onMentionTriggerChange,
    },
    ref
  ) {
    const initialConfig = {
      namespace: "ChatInput",
      theme,
      onError,
      nodes: [MentionNode],
    };

    return (
      <LexicalComposer initialConfig={initialConfig}>
        <ExposeInsertMentionHandle forwardedRef={ref} />
        {onMentionTriggerChange && (
          <MentionTriggerPlugin onTriggerChange={onMentionTriggerChange} />
        )}
        <PlainTextPlugin
          contentEditable={
            <ContentEditable
              className={cn(
                "placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground min-h-[24px] w-full min-w-0 outline-none",
                className
              )}
              aria-placeholder={placeholder}
              placeholder={
                <div className="pointer-events-none absolute left-0 top-0 text-muted-foreground">
                  {placeholder}
                </div>
              }
              onKeyDown={onKeyDown}
            />
          }
          placeholder={
            <div className="pointer-events-none absolute left-0 top-0 text-muted-foreground">
              {placeholder}
            </div>
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
        <SyncValuePlugin value={value} />
        <OnChangeWrapper onChange={onChange} />
        <HistoryPlugin />
      </LexicalComposer>
    );
  }
);

export { LexicalEditor };
