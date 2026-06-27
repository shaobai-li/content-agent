"use client";

import { useState, useRef, useCallback } from "react";
import { Check, Ellipsis, Loader2, Plus, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import { Card, CardContent } from "@/shared/ui/card";
import { cn } from "@/shared/lib/cn";
import { Switch } from "@/shared/ui/switch";
import { usePrompts, useSkills } from "./useSettingsApi";

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

interface SettingsPanelProps {
  agentId: string;
}

export function SettingsPanel({ agentId }: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<SettingsTabId>("system");
  const { skills, loading: skillsLoading, error: skillsError, toggleDisable, upload, remove } = useSkills(agentId);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleNewSkill = () => {
    fileInputRef.current?.click();
  };

  const handleFolderSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadError(null);
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
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);

  const handleDelete = (skillId: string, skillName: string) => {
    setDeleteConfirm({ id: skillId, name: skillName });
  };

  const handleDeleteConfirmed = async () => {
    if (!deleteConfirm) return;
    setUploadError(null);
    try {
      await remove(deleteConfirm.id);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "删除失败");
    }
    setDeleteConfirm(null);
  };

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
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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
    if (modified.length === 0) return;

    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      for (const filename of modified) {
        await savePrompt(filename, dirtyText[filename]);
      }
      setDirtyText({});
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 1500);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }, [dirtyText, savePrompt]);

  const handleCancel = useCallback(() => {
    setDirtyText({});
    setSaveError(null);
    setSaveSuccess(false);
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
          <div className="flex flex-col gap-2">
            {saveError && (
              <p className="text-sm text-destructive text-right">{saveError}</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={handleCancel}
                disabled={saving}
                className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || Object.keys(dirtyText).length === 0}
                className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-sm text-background hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {saving ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : saveSuccess ? (
                  <Check className="size-3.5" />
                ) : null}
                {saving ? "Saving..." : saveSuccess ? "Saved!" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Application tab: skills */}
      {activeTab === "application" && (
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto" role="tabpanel">
          {/* 隐藏的文件选择器（用于上传技能文件夹） */}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            /* @ts-expect-error webkitdirectory 是非标准属性 */
            webkitdirectory=""
            onChange={handleFolderSelected}
          />

          {skillsError && (
            <p className="text-sm text-destructive">{skillsError}</p>
          )}
          {uploadError && (
            <p className="text-sm text-destructive">{uploadError}</p>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {skillsLoading ? (
              <p className="col-span-full text-sm text-muted-foreground">加载中...</p>
            ) : skills && skills.length > 0 ? (
              skills.map((skill) => (
                <Card
                  key={skill.id}
                  className="relative min-h-36 gap-0 border-border bg-card py-0 text-card-foreground shadow-sm"
                >
                  <Switch
                    className="absolute right-4 top-4"
                    checked={!skill.disabled}
                    onCheckedChange={(checked) => toggleDisable(skill.id, !checked)}
                    aria-label={`${skill.disabled ? "启用" : "禁用"} ${skill.name}`}
                  />
                  {/* 内容区：flex-grow 7，占 70% */}
                  <CardContent
                    className="flex min-h-0 flex-col gap-2 overflow-visible pb-0 pr-14 pt-6"
                    style={{ flex: "7 1 0%" }}
                  >
                    <span className="text-sm font-medium text-foreground">{skill.name}</span>
                    <p className="min-w-0 line-clamp-2 text-sm text-muted-foreground">{skill.description}</p>
                  </CardContent>

                  {/* 底部操作区：flex-grow 3，占 30%，不收缩 */}
                  <div
                    className="flex min-h-0 flex-col overflow-visible px-6 pb-2"
                    style={{ flex: "3 0 0%" }}
                  >
                    <div className="w-full border-t border-border" />
                    <div className="flex items-center justify-between pt-1.5">
                      {/* TODO: 接入实际数据。与 AgentInfoCard 的 "Token" 标签对应，后续需展示技能词数/Token 数 */}
                      <span className="text-xs text-muted-foreground">Words</span>
                      {skill.source === "user" && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className="flex size-6 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Ellipsis className="size-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" sideOffset={4}>
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => handleDelete(skill.id, skill.name)}
                            >
                              <Trash2 className="size-4" />
                              删除
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>
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
                <Plus className="size-5" aria-hidden />
              </span>
              <span className="text-sm font-medium text-muted-foreground">
                {uploading ? "上传中..." : "New Skill"}
              </span>
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
          <div className="flex flex-col gap-2">
            {saveError && (
              <p className="text-sm text-destructive text-right">{saveError}</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={handleCancel}
                disabled={saving}
                className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || Object.keys(dirtyText).length === 0}
                className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-sm text-background hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {saving ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : saveSuccess ? (
                  <Check className="size-3.5" />
                ) : null}
                {saving ? "Saving..." : saveSuccess ? "Saved!" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
      <AlertDialog open={deleteConfirm !== null} onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除 skill「{deleteConfirm?.name ?? ""}」吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDeleteConfirmed}>
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
