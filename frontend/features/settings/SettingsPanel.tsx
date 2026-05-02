"use client";

import { Combobox } from "@/shared/ui/combobox";
import { cn } from "@/shared/lib/cn";

import { SkillsFileInput } from "./SkillsFileInput";

const mockModelOptions = [
  { value: "gpt-4o", label: "GPT-4o" },
  { value: "claude-3-5-sonnet", label: "Claude 3.5 Sonnet" },
] as const;

const settingsTextareaClass = cn(
  "selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input w-full min-w-0 rounded-md border bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-base resize-y min-h-16 overflow-y-auto break-words",
  "focus-visible:border-input focus-visible:ring-0 focus-visible:ring-offset-0",
);

export function SettingsPanel() {
  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-foreground">提示词</span>
        <textarea className={settingsTextareaClass} rows={3} />
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-foreground">api</span>
        <textarea className={settingsTextareaClass} rows={3} />
      </div>
      <div className="flex w-full min-w-0 flex-row gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <span className="text-sm font-medium text-foreground">模型</span>
          <Combobox options={mockModelOptions} placeholder="选择模型" searchPlaceholder="搜索模型…" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <span className="text-sm font-medium text-foreground">Skills</span>
          <SkillsFileInput />
        </div>
      </div>
    </div>
  );
}
