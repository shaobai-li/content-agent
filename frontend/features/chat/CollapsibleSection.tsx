"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/shared/lib/cn";

interface CollapsibleSectionProps {
  title: string;
  content: string;
  isStreaming?: boolean;
  defaultExpanded?: boolean;
  /** 流式尚未收到正文时的占位 */
  emptyLabel?: string;
}

export function CollapsibleSection({
  title,
  content,
  isStreaming = false,
  defaultExpanded = false,
  emptyLabel = "加载中…",
}: CollapsibleSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const toggleExpanded = () => setIsExpanded(!isExpanded);

  const hasContent = content.length > 0;
  const displayContent = hasContent
    ? content
        .replace(/\r\n/g, "\n")      // 统一换行符
    : "";

  return (
    <div className="mb-2 min-w-0 rounded-lg overflow-hidden">
      <div className="grid grid-cols-[20px_1fr]">
        {/* 左侧图标列 */}
        <button
          type="button"
          onClick={toggleExpanded}
          className="flex justify-center pt-[10px] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-400"
          aria-label={isExpanded ? "折叠" : "展开"}
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
          )}
        </button>

        {/* 右侧内容列 */}
        <div className="min-w-0">
          <button
            type="button"
            onClick={toggleExpanded}
            className={cn(
              "w-full text-left py-2 pr-3 text-sm font-medium",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-400"
            )}
          >
            <span className="break-all text-slate-700">{title}</span>
            {isStreaming && (
              <span className="ml-2 inline-flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse delay-75" />
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse delay-150" />
              </span>
            )}
          </button>

          {isExpanded && (
            <div className="pr-3 pb-3">
              <div className="text-sm text-slate-600 leading-snug">
                {hasContent ? (
                  displayContent.split(/\n{2,}/).filter(Boolean).map((paragraph, i) => (
                    <div
                      key={i}
                      className="min-w-0 max-w-full whitespace-pre-wrap break-all mb-6 last:mb-0"
                    >
                      {paragraph}
                    </div>
                  ))
                ) : (
                  <span className="text-slate-400 italic">{emptyLabel}</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
