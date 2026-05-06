"use client";

import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { cn } from "@/shared/lib/cn";

import { SkillsFileInput } from "./SkillsFileInput";

const systemPromptFieldClass = cn(
  "selection:bg-primary selection:text-primary-foreground border-input w-full min-w-0 rounded-md border bg-muted px-3 py-2 text-base text-foreground shadow-xs transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-base resize-none overflow-y-auto break-words",
  "focus-visible:border-input focus-visible:ring-0 focus-visible:ring-offset-0",
);

export function SettingsPanel() {
  return (
    <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col gap-6">
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-foreground">System Prompt</span>
        <Card className="gap-0 border-border bg-card py-4 text-card-foreground shadow-sm">
          <CardContent className="flex flex-col gap-4 px-4">
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-foreground">Role</span>
              <textarea className={systemPromptFieldClass} rows={2} />
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-foreground">Content</span>
              <textarea className={systemPromptFieldClass} rows={2} />
            </div>
          </CardContent>
        </Card>
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <span className="text-sm font-medium text-foreground">Skills</span>
        <SkillsFileInput />
      </div>
      <div className="mt-auto flex w-full justify-end gap-2">
        <Button type="button" variant="outline">
          Cancel
        </Button>
        <Button type="button">Enter</Button>
      </div>
    </div>
  );
}
