"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, FileText, PenSquare, TerminalSquare, WandSparkles, type LucideIcon } from "lucide-react";
import { cn } from "@/shared/lib/cn";

interface CollapsibleSectionProps {
  title: string;
  icon?: string;
  content: string;
  isStreaming?: boolean;
  defaultExpanded?: boolean;
  /** 流式尚未收到正文时的占位 */
  emptyLabel?: string;
}

export function CollapsibleSection({
  title,
  icon,
  content,
  isStreaming = false,
  defaultExpanded = false,
  emptyLabel = "加载中…",
}: CollapsibleSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const toggleExpanded = () => setIsExpanded(!isExpanded);

  const hasContent = content.length > 0;
  const iconMap: Record<string, LucideIcon> = {
    "tool-read": FileText,
    "tool-write": PenSquare,
    "tool-command": TerminalSquare,
    "tool-skill": WandSparkles,
  };
  const BoxIcon = icon ? (iconMap[icon] || FileText) : FileText;

  return (
    <div className="mb-2 border border-slate-200 rounded-lg overflow-hidden bg-slate-50/50">
      <button
        type="button"
        onClick={toggleExpanded}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2 text-sm font-medium",
          "hover:bg-slate-100 transition-colors",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
        )}
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
        )}
        <BoxIcon className="w-4 h-4 text-slate-500 shrink-0" />
        <span className="flex-1 text-left text-slate-700">{title}</span>
        {isStreaming && (
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse delay-75" />
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse delay-150" />
          </span>
        )}
      </button>

      {isExpanded && (
        <div className="px-3 pb-3">
          <div className="text-sm text-slate-600 whitespace-pre-wrap">
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
