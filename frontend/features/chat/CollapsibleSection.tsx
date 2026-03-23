"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Lightbulb, ListOrdered } from "lucide-react";
import { cn } from "@/shared/lib/cn";

interface CollapsibleSectionProps {
  title: string;
  content: string | string[];
  isStreaming?: boolean;
  type: "thinking" | "plan";
  defaultExpanded?: boolean;
}

export function CollapsibleSection({
  title,
  content,
  isStreaming = false,
  type,
  defaultExpanded = true,
}: CollapsibleSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const toggleExpanded = () => setIsExpanded(!isExpanded);

  const Icon = type === "thinking" ? Lightbulb : ListOrdered;
  const contentArray = Array.isArray(content) ? content : [content];
  const hasContent = contentArray.length > 0 && contentArray[0] !== "";

  return (
    <div className="mb-2 border border-slate-200 rounded-lg overflow-hidden bg-slate-50/50">
      <button
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
        <Icon className="w-4 h-4 text-slate-500 shrink-0" />
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
          {type === "thinking" ? (
            <div className="text-sm text-slate-600 whitespace-pre-wrap">
              {hasContent ? (
                contentArray[0]
              ) : (
                <span className="text-slate-400 italic">思考中...</span>
              )}
            </div>
          ) : (
            <ol className="list-decimal list-inside space-y-1">
              {hasContent ? (
                contentArray.map((step, index) => (
                  <li key={index} className="text-sm text-slate-600">
                    {step}
                  </li>
                ))
              ) : (
                <li className="text-sm text-slate-400 italic">规划中...</li>
              )}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
