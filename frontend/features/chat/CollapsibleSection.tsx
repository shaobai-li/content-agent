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

  return (
    <div className="mb-2 min-w-0 rounded-lg overflow-hidden">
      {/* 单个 button，自身为 grid 布局，图标列 20px + 标题列自适应 */}
      <button
        type="button"
        onClick={toggleExpanded}
        className={cn(
          "w-full grid grid-cols-[20px_1fr]",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-400"
        )}
      >
        <span className="flex justify-center pt-[10px]">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
          )}
        </span>
        <span className="py-2 pr-3 text-sm font-medium text-left">
          <span className="break-all text-slate-700">{title}</span>
          {isStreaming && (
            <span className="ml-2 inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse delay-75" />
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse delay-150" />
            </span>
          )}
        </span>
      </button>

      {isExpanded && (
        <div className="pl-5 pr-3 pb-3">
          <div className="min-w-0 max-w-full whitespace-pre-wrap break-all text-sm text-slate-600 leading-snug">
            {hasContent ? (
              content
            ) : (
              <span className="text-slate-400 italic">{emptyLabel}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
