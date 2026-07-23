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
import { McpServersPanel } from "./McpServersPanel";
import { useTranslation } from "react-i18next";

const settingsTabs = [
  { id: "system" as const, labelKey: "settingsPanel.tabs.system" as const },
  { id: "application" as const, labelKey: "settingsPanel.tabs.application" as const },
  { id: "personalization" as const, labelKey: "settingsPanel.tabs.personalization" as const },
  { id: "capability" as const, labelKey: "settingsPanel.tabs.capability" as const },
];

type SettingsTabId = (typeof settingsTabs)[number]["id"];

const settingsMultilineFieldClass = cn(
  "selection:bg-primary selection:text-primary-foreground border-input w-full min-w-0 rounded-md border bg-muted px-3 py-2 text-base text-foreground shadow-xs transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-base resize-none overflow-y-auto break-words",
  "focus-visible:border-input focus-visible:ring-0 focus-visible:ring-offset-0",
);

const personalizationFields = [
  { id: "SOUL.md", label: "SOUL" },
  { id: "USER.md", label: "USER" },
  { id: "IDENTITY.md", label: "IDENTITY" },
] as const;

const systemFields = [
  { id: "SYSTEM.md", label: "SYSTEM" },
] as const;

interface SettingsPanelProps {
  agentId: string;
}

export function SettingsPanel({ agentId }: SettingsPanelProps) {
  const { t } = useTranslation();
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
      setUploadError(err instanceof Error ? err.message : t("common.error.uploadFailed"));
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
      setUploadError(err instanceof Error ? err.message : t("common.error.deleteFailed"));
    }
    setDeleteConfirm(null);
  };

  // 鈹€鈹€ Prompts 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
  const {
    files: serverFiles,
    loading: promptsLoading,
    error: promptsError,
    save: savePrompt,
    load: reloadPrompts,
  } = usePrompts(agentId);

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

  // 鈹€鈹€ Header 鏆撮湶淇濆瓨/閲嶇疆鏂规硶 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
  // SettingsHeader 閫氳繃 DOM 浜嬩欢鎴栫埗绾у崗璋冿紱杩欓噷鐩存帴鐢ㄦ渶绠€鍗曠殑鏂规:
  // 鏆撮湶鍒?window 渚?header 璋冪敤锛堟垨鏀逛负 context锛?
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
      setSaveError(err instanceof Error ? err.message : t("common.error.saveFailed"));
    } finally {
      setSaving(false);
    }
  }, [dirtyText, savePrompt, t]);

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
              {t(tab.labelKey)}
            </button>
          );
        })}
      </div>

      {/* System tab: SYSTEM.md */}
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
          {/* 琛屽唴淇濆瓨/鍙栨秷 */}
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
                {t("settingsPanel.prompts.cancel")}
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
                {saving ? t("settingsPanel.prompts.saving") : saveSuccess ? t("settingsPanel.prompts.saved") : t("settingsPanel.prompts.save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Application tab: skills */}
      {activeTab === "application" && (
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto" role="tabpanel">
          {/* 闅愯棌鐨勬枃浠堕€夋嫨鍣紙鐢ㄤ簬涓婁紶鎶€鑳芥枃浠跺す锛?*/}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            /* @ts-expect-error webkitdirectory 鏄潪鏍囧噯灞炴€?*/
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
              <p className="col-span-full text-sm text-muted-foreground">{t("settingsPanel.skills.loading")}</p>
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
                    aria-label={t(
                      skill.disabled ? "settingsPanel.skills.enableLabel" : "settingsPanel.skills.disableLabel",
                      { name: skill.name },
                    )}
                  />
                  {/* 鍐呭鍖猴細flex-grow 7锛屽崰 70% */}
                  <CardContent
                    className="flex min-h-0 flex-col gap-2 overflow-visible pb-0 pr-14 pt-6"
                    style={{ flex: "7 1 0%" }}
                  >
                    <span className="text-sm font-medium text-foreground">{skill.name}</span>
                    <p className="min-w-0 line-clamp-2 text-sm text-muted-foreground">{skill.description}</p>
                  </CardContent>

                  {/* 搴曢儴鎿嶄綔鍖猴細flex-grow 3锛屽崰 30%锛屼笉鏀剁缉 */}
                  <div
                    className="flex min-h-0 flex-col overflow-visible px-6 pb-2"
                    style={{ flex: "3 0 0%" }}
                  >
                    <div className="w-full border-t border-border" />
                    <div className="flex items-center justify-between pt-1.5">
                      {/* TODO: 鎺ュ叆瀹為檯鏁版嵁銆備笌 AgentInfoCard 鐨?"Token" 鏍囩瀵瑰簲锛屽悗缁渶灞曠ず鎶€鑳借瘝鏁?Token 鏁?*/}
                      <span className="text-xs text-muted-foreground">{t("settingsPanel.skills.words")}</span>
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
                              {t("common.delete")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>
                </Card>
              ))
            ) : (
              <p className="col-span-full text-sm text-muted-foreground">{t("settingsPanel.skills.empty")}</p>
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
                {uploading ? t("settingsPanel.skills.uploading") : t("settingsPanel.skills.newSkill")}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Personalization tab: SOUL.md, USER.md, IDENTITY.md */}
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
          {/* 琛屽唴淇濆瓨/鍙栨秷 */}
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
                {t("settingsPanel.prompts.cancel")}
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
                {saving ? t("settingsPanel.prompts.saving") : saveSuccess ? t("settingsPanel.prompts.saved") : t("settingsPanel.prompts.save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Capability tab: MCP 鏈嶅姟鍣?*/}
      {activeTab === "capability" && (
        <div
          className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto"
          role="tabpanel"
        >
          <McpServersPanel agentId={agentId} />
        </div>
      )}

      <AlertDialog open={deleteConfirm !== null} onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settingsPanel.skills.confirmDelete.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("settingsPanel.skills.confirmDelete.description", { name: deleteConfirm?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("settingsPanel.skills.confirmDelete.cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDeleteConfirmed}>
              {t("settingsPanel.skills.confirmDelete.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

