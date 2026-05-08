"use client";

import { useState } from "react";
import { BoltIcon, LightBulbIcon, PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { cn } from "@/shared/lib/cn";
import { Switch } from "@/shared/ui/switch";

const settingsTabs = [
  { id: "personalization" as const, label: "Personalization" },
  { id: "project" as const, label: "Project" },
  { id: "skills" as const, label: "Skills" },
];

type SettingsTabId = (typeof settingsTabs)[number]["id"];

const systemPromptFieldClass = cn(
  "selection:bg-primary selection:text-primary-foreground border-input w-full min-w-0 rounded-md border bg-muted px-3 py-2 text-base text-foreground shadow-xs transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-base resize-none overflow-y-auto break-words",
  "focus-visible:border-input focus-visible:ring-0 focus-visible:ring-offset-0",
);

const mockSkills = [
  {
    name: "Web Search",
    description: "检索网页并汇总要点，用于补充实时信息。",
  },
  {
    name: "Code Review",
    description: "审查代码风格、可读性与常见缺陷。",
  },
  {
    name: "Summarize",
    description: "将长文或对话压缩为结构化摘要。",
  },
] as const;

export function SettingsPanel() {
  const [activeTab, setActiveTab] = useState<SettingsTabId>("personalization");

  return (
    <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col gap-6">
      <div
        className="flex min-w-0 gap-8 border-b border-border"
        role="tablist"
        aria-label="Settings sections"
      >
        {settingsTabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "relative -mb-px shrink-0 border-b-2 pb-2 text-sm transition-colors outline-none",
                "focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2",
                isActive
                  ? "border-foreground font-semibold text-foreground"
                  : "border-transparent font-medium text-muted-foreground hover:text-foreground/80",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "personalization" && (
        <div className="flex flex-col gap-2" role="tabpanel">
          <div className="flex items-center gap-2">
            <LightBulbIcon className="size-4 shrink-0 text-foreground" aria-hidden />
            <span className="text-sm font-semibold text-foreground">System Prompt</span>
          </div>
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
      )}

      {activeTab === "project" && (
        <div className="flex flex-col gap-2" role="tabpanel">
          <p className="text-sm text-muted-foreground">Project</p>
        </div>
      )}

      {activeTab === "skills" && (
        <div className="flex min-w-0 flex-col gap-2" role="tabpanel">
          <div className="flex items-center gap-2">
            <BoltIcon className="size-4 shrink-0 text-foreground" aria-hidden />
            <span className="text-sm font-semibold text-foreground">Skills</span>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {mockSkills.map((skill, index) => (
              <Card
                key={skill.name}
                className="relative min-h-36 gap-0 border-border bg-card py-6 text-card-foreground shadow-sm"
              >
                <Switch
                  className="absolute right-4 top-4"
                  defaultChecked={index === 0}
                  aria-label={`启用 ${skill.name}`}
                />
                <CardContent className="flex flex-col gap-2 pb-10 pr-14 pt-0">
                  <span className="text-sm font-medium text-foreground">{skill.name}</span>
                  <p className="text-sm text-muted-foreground">{skill.description}</p>
                </CardContent>
                <button
                  type="button"
                  className={cn(
                    "absolute bottom-3 right-3 rounded-md p-1.5 text-destructive outline-none transition-opacity",
                    "opacity-0 hover:opacity-100 focus-visible:opacity-100",
                    "hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-ring/50",
                  )}
                  aria-label={`删除 ${skill.name}`}
                >
                  <TrashIcon className="size-5" aria-hidden />
                </button>
              </Card>
            ))}
            <button
              type="button"
              className={cn(
                "flex min-h-36 w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-transparent py-6 shadow-none outline-none transition-colors",
                "hover:border-muted-foreground/50 hover:bg-muted/30",
                "focus-visible:border-border focus-visible:ring-2 focus-visible:ring-ring/50",
              )}
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/45 text-muted-foreground">
                <PlusIcon className="size-5" aria-hidden />
              </span>
              <span className="text-sm font-medium text-muted-foreground">New Skill</span>
            </button>
          </div>
        </div>
      )}
      <div className="mt-auto flex w-full justify-end gap-2">
        <Button type="button" variant="outline">
          Cancel
        </Button>
        <Button type="button">Enter</Button>
      </div>
    </div>
  );
}
