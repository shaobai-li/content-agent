"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import "easymde/dist/easymde.min.css";

interface DocumentPanelProps {
  agentId: string;
  children?: ReactNode;
}

export function DocumentPanel({ agentId, children }: DocumentPanelProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const easymdeRef = useRef<any>(null);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!textareaRef.current || !isClient) return;

    // 动态导入 EasyMDE，确保只在客户端加载
    import("easymde").then((EasyMDE) => {
      if (!textareaRef.current) return;
      
      easymdeRef.current = new EasyMDE.default({
        element: textareaRef.current,
        initialValue: "",
        placeholder: "Edit your Markdown here...",
        spellChecker: false,
      });
    });

    return () => {
      if (easymdeRef.current) {
        easymdeRef.current.toTextArea();
        easymdeRef.current = null;
      }
    };
  }, [isClient]);

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

