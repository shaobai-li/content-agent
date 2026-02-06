"use client";

import { ReactNode, useEffect, useRef } from "react";
import EasyMDE from "easymde";
import "easymde/dist/easymde.min.css";

interface DocumentPanelProps {
  agentId: string;
  children?: ReactNode;
}

export function DocumentPanel({ agentId, children }: DocumentPanelProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const easymdeRef = useRef<EasyMDE | null>(null);

  useEffect(() => {
    if (!textareaRef.current) return;

    easymdeRef.current = new EasyMDE({
      element: textareaRef.current,
      initialValue: "",
      placeholder: "在此编写 Markdown 内容...",
      spellChecker: false,
    });

    return () => {
      if (easymdeRef.current) {
        easymdeRef.current.toTextArea();
        easymdeRef.current = null;
      }
    };
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto p-4">
        <div className="space-y-4">
          <div className="overflow-auto [&_.EasyMDEContainer]:!border-0">
            <textarea ref={textareaRef} />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

