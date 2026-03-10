"use client";

import { useEffect } from "react";
import { $getRoot, $createParagraphNode, $createTextNode } from "lexical";
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

const theme = {};

function onError(error: Error) {
  console.error(error);
}

function SyncValuePlugin({ value }: { value: string }) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    editor.getEditorState().read(() => {
      const current = $getRoot().getTextContent();
      if (current !== value) {
        editor.update(() => {
          const root = $getRoot();
          root.clear();
          if (value) {
            const p = $createParagraphNode();
            p.append($createTextNode(value));
            root.append(p);
          }
        });
      }
    });
  }, [editor, value]);

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

interface LexicalEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  onKeyDown?: (e: React.KeyboardEvent) => void;
}

function LexicalEditor({
  value,
  onChange,
  placeholder = "Type messages ...",
  className,
  onKeyDown,
}: LexicalEditorProps) {
  const initialConfig = {
    namespace: "ChatInput",
    theme,
    onError,
    nodes: [MentionNode],
  };

  return (
    <LexicalComposer initialConfig={initialConfig}>
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

export { LexicalEditor };
