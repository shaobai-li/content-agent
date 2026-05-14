"use client";

import { useState, useRef } from "react";
import { PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { Card, CardContent } from "@/shared/ui/card";
import { cn } from "@/shared/lib/cn";
import { Switch } from "@/shared/ui/switch";
import { useSkills } from "./useSettingsApi";
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
  { id: "soul", label: "SOUL" },
  { id: "user", label: "USER" },
] as const;

const projectFields = [
  { id: "agents", label: "AGENTS" },
] as const;

export function SettingsPanel({ agentId }: { agentId: string }) {
  const [activeTab, setActiveTab] = useState<SettingsTabId>("system");
  const { skills, loading: skillsLoading, toggleDisable, upload } = useSkills(agentId);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleNewSkill = () => {
    fileInputRef.current?.click();
  };

  const handleFolderSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);

    try {
      const firstPath = files[0].webkitRelativePath;
      const folderName = firstPath.split("/")[0];

      const fileMap: Record<string, string> = {};
      const readers: Promise<void>[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const relativePath = file.webkitRelativePath.slice(folderName.length + 1);
        readers.push(
          new Promise<void>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              fileMap[relativePath] = reader.result as string;
              resolve();
            };
            reader.onerror = reject;
            reader.readAsText(file);
          }),
        );
      }

      await Promise.all(readers);
      await upload(folderName, fileMap);
    } catch {
      // 静默失败，后续 commit 加入错误处理
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col gap-6">
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

      {activeTab === "system" && (
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto" role="tabpanel">
          <Card className="gap-0 border-border bg-card py-4 text-card-foreground shadow-sm">
            <CardContent className="flex flex-col gap-4 px-4">
              {projectFields.map((field) => (
                <div key={field.id} className="flex flex-col gap-2">
                  <label htmlFor={`settings-system-${field.id}`} className="text-sm font-medium text-foreground">
                    {field.label}
                  </label>
                  <textarea
                    id={`settings-system-${field.id}`}
                    className={settingsMultilineFieldClass}
                    rows={10}
                    autoComplete="off"
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "application" && (
        <div className="flex min-w-0 flex-col gap-2" role="tabpanel">
          {/* 隐藏的文件选择器（用于上传技能文件夹） */}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            /* @ts-expect-error webkitdirectory 是非标准属性 */
            webkitdirectory=""
            onChange={handleFolderSelected}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {skillsLoading ? (
              <p className="col-span-full text-sm text-muted-foreground">加载中...</p>
            ) : skills && skills.length > 0 ? (
              skills.map((skill) => (
                <Card
                  key={skill.id}
                  className="relative min-h-36 gap-0 border-border bg-card py-6 text-card-foreground shadow-sm"
                >
                  <Switch
                    className="absolute right-4 top-4"
                    checked={!skill.disabled}
                    onCheckedChange={(checked) => toggleDisable(skill.id, !checked)}
                    aria-label={`${skill.disabled ? "启用" : "禁用"} ${skill.name}`}
                  />
                  <CardContent className="flex flex-col gap-2 pb-10 pr-14 pt-0">
                    <span className="text-sm font-medium text-foreground">{skill.name}</span>
                    <p className="text-sm text-muted-foreground">{skill.description}</p>
                  </CardContent>
                  {skill.source === "user" && (
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
                  )}
                </Card>
              ))
            ) : (
              <p className="col-span-full text-sm text-muted-foreground">暂无技能</p>
            )}
            <button
              type="button"
              disabled={uploading}
              onClick={handleNewSkill}
              className={cn(
                "flex min-h-36 w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-transparent py-6 shadow-none outline-none transition-colors",
                "hover:border-muted-foreground/50 hover:bg-muted/30",
                "focus-visible:border-border focus-visible:ring-2 focus-visible:ring-ring/50",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/45 text-muted-foreground">
                <PlusIcon className="size-5" aria-hidden />
              </span>
              <span className="text-sm font-medium text-muted-foreground">
                {uploading ? "上传中..." : "New Skill"}
              </span>
            </button>
          </div>
        </div>
      )}

      {activeTab === "personalization" && (
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto" role="tabpanel">
          <Card className="gap-0 border-border bg-card py-4 text-card-foreground shadow-sm">
            <CardContent className="flex flex-col gap-4 px-4">
              {personalizationFields.map((field) => (
                <div key={field.id} className="flex flex-col gap-2">
                  <label htmlFor={`settings-personalization-${field.id}`} className="text-sm font-medium text-foreground">
                    {field.label}
                  </label>
                  <textarea
                    id={`settings-personalization-${field.id}`}
                    className={settingsMultilineFieldClass}
                    rows={6}
                    autoComplete="off"
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
