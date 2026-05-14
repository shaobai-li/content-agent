"use client";

import { useState, useCallback } from "react";
import { PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { Card, CardContent } from "@/shared/ui/card";
import { cn } from "@/shared/lib/cn";
import { Switch } from "@/shared/ui/switch";
import { usePrompts } from "./useSettingsApi";

const settingsTabs = [
  { id: "system" as const, label: "System" },
  { id: "application" as const, label: "Application" },
  { id: "personalization" as const, label: "Personalization" },
];

type SettingsTabId = (typeof settingsTabs)[number]["id"];

const settingsMultilineFieldClass = cn(
  "selection:bg-primary selection:text-primary-foreground border-input w-full min-w-0 rounded-md border bg-muted px-3 py-2 text-base text-foreground shadow-xs transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-base resize-none overflow-y-auto break-words",
  "focus-visible:border-input focus-visible:ring-0 focus-visible:ring-offset-0",
);

const personalizationFields = [
  { id: "SOUL.md", label: "SOUL" },
  { id: "USER.md", label: "USER" },
] as const;

const systemFields = [
  { id: "AGENTS.md", label: "AGENTS" },
] as const;

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

interface SettingsPanelProps {
  agentId: string;
}

export function SettingsPanel({ agentId }: SettingsPanelProps) {

  const [activeTab, setActiveTab] = useState<SettingsTabId>("system");

  // ── Prompts ────────────────────────────────────────────────────
  const {
    files: serverFiles,
    loading: promptsLoading,
    error: promptsError,
    save: savePrompt,
    load: reloadPrompts,
  } = usePrompts(agentId);

  // 本地编辑状态（未保存的修改）
  const [dirtyText, setDirtyText] = useState<Record<string, string>>({});

  const getValue = useCallback(
    (filename: string) => {
      if (filename in dirtyText) return dirtyText[filename];
      return serverFiles?.[filename] ?? "";
    },
    [dirtyText, serverFiles],
  );

  const handleChange = useCallback(
    (filename: string, value: string) => {
      setDirtyText((prev) => ({ ...prev, [filename]: value }));
    },
    [],
  );

  // ── Header 暴露保存/重置方法 ──────────────────────────────────
  // SettingsHeader 通过 DOM 事件或父级协调；这里直接用最简单的方案:
  // 暴露到 window 供 header 调用（或改为 context）

  const handleSave = useCallback(async () => {
    const modified = Object.keys(dirtyText);
    for (const filename of modified) {
      await savePrompt(filename, dirtyText[filename]);
    }
    setDirtyText({});
  }, [dirtyText, savePrompt]);

  const handleCancel = useCallback(() => {
    setDirtyText({});
    reloadPrompts();
  }, [reloadPrompts]);

  return (
    <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col gap-6">
      {/* Tabs */}
      <div
        className="flex min-w-0 shrink-0 gap-8 border-b border-border"
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

      {/* System tab: AGENTS.md */}
      {activeTab === "system" && (
        <div
          className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto"
          role="tabpanel"
        >
          {promptsError && (
            <p className="text-sm text-destructive">{promptsError}</p>
          )}
          <Card className="gap-0 border-border bg-card py-4 text-card-foreground shadow-sm">
            <CardContent className="flex flex-col gap-4 px-4">
              {systemFields.map((field) => (
                <div key={field.id} className="flex flex-col gap-2">
                  <label
                    htmlFor={`settings-system-${field.id}`}
                    className="text-sm font-medium text-foreground"
                  >
                    {field.label}
                  </label>
                  <textarea
                    id={`settings-system-${field.id}`}
                    className={settingsMultilineFieldClass}
                    rows={10}
                    autoComplete="off"
                    value={getValue(field.id)}
                    onChange={(e) => handleChange(field.id, e.target.value)}
                    disabled={promptsLoading}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
          {/* 行内保存/取消 */}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="rounded-md bg-foreground px-3 py-1.5 text-sm text-background hover:opacity-90"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* Application tab: skills (mock for PR1) */}
      {activeTab === "application" && (
        <div className="flex min-w-0 flex-col gap-2" role="tabpanel">
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

      {/* Personalization tab: SOUL.md, USER.md */}
      {activeTab === "personalization" && (
        <div
          className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto"
          role="tabpanel"
        >
          {promptsError && (
            <p className="text-sm text-destructive">{promptsError}</p>
          )}
          <Card className="gap-0 border-border bg-card py-4 text-card-foreground shadow-sm">
            <CardContent className="flex flex-col gap-4 px-4">
              {personalizationFields.map((field) => (
                <div key={field.id} className="flex flex-col gap-2">
                  <label
                    htmlFor={`settings-personalization-${field.id}`}
                    className="text-sm font-medium text-foreground"
                  >
                    {field.label}
                  </label>
                  <textarea
                    id={`settings-personalization-${field.id}`}
                    className={settingsMultilineFieldClass}
                    rows={6}
                    autoComplete="off"
                    value={getValue(field.id)}
                    onChange={(e) => handleChange(field.id, e.target.value)}
                    disabled={promptsLoading}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
          {/* 行内保存/取消 */}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="rounded-md bg-foreground px-3 py-1.5 text-sm text-background hover:opacity-90"
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
