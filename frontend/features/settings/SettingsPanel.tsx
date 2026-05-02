"use client";

import { cn } from "@/shared/lib/cn";

const settingsTextareaClass = cn(
  "placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input w-full min-w-0 rounded-md border bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-base resize-none min-h-[7rem] overflow-y-auto break-words",
  "focus-visible:border-input focus-visible:ring-0 focus-visible:ring-offset-0",
);

export function SettingsPanel() {
  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-foreground">提示词</span>
        <textarea placeholder="提示词" className={settingsTextareaClass} rows={5} />
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-foreground">skills</span>
        <textarea placeholder="skills" className={settingsTextareaClass} rows={5} />
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-foreground">api</span>
        <textarea placeholder="api" className={settingsTextareaClass} rows={5} />
      </div>
    </div>
  );
}
