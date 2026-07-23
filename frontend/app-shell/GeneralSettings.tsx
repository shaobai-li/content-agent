"use client";

import { useCallback, useEffect, useState } from "react";
import { http } from "@/shared/api/http";
import { Button } from "@/shared/ui/button";
import { Loader2 } from "lucide-react";
import { LanguageSelector } from "./LanguageSelector";
import { useTranslation } from "react-i18next";

interface EnvResponse {
  providers: { provider: string; display_name: string; set: boolean; masked: string }[];
  user_data_dir: string;
}

function GeneralSettings() {
  const { t } = useTranslation();
  const DEFAULT_USER_DATA_DIR = "";
  const [userDataDir, setUserDataDir] = useState(DEFAULT_USER_DATA_DIR);
  const [userDataDirOriginal, setUserDataDirOriginal] = useState(DEFAULT_USER_DATA_DIR);
  const [savingUserDataDir, setSavingUserDataDir] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const data = await http.get<EnvResponse>("/api/settings/env");
      if (data.user_data_dir) {
        setUserDataDir(data.user_data_dir);
        setUserDataDirOriginal(data.user_data_dir);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error.loadFailed"));
    }
  }, [t]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleSaveUserDataDir = useCallback(async () => {
    setSavingUserDataDir(true);
    setError(null);
    try {
      await http.put("/api/settings/env", { user_data_dir: userDataDir });
      setUserDataDirOriginal(userDataDir);
      await refresh();
      // 通知 ChatPage 等组件 provider 配置已变更，重新拉取模型列表
      window.dispatchEvent(new CustomEvent("provider-config-changed"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error.saveFailed"));
    } finally {
      setSavingUserDataDir(false);
    }
  }, [userDataDir, refresh, t]);

  const userDataDirChanged = userDataDir !== userDataDirOriginal;

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* 语言切换 */}
      <LanguageSelector />

      <div className="border-t border-border" />

      {/* 用户数据存储目录 */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="env-user-data-dir" className="text-sm font-medium text-foreground">
          {t("settings.userDataDir.label")}
        </label>
        <div className="flex items-center border border-input rounded-md bg-card overflow-hidden transition-colors focus-within:border-ring">
          <input
            id="env-user-data-dir"
            type="text"
            className="flex-1 min-w-0 px-3 py-1.5 text-sm bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground"
            placeholder={t("settings.userDataDir.placeholder")}
            value={userDataDir}
            onChange={(e) => setUserDataDir(e.target.value)}
          />
          <Button
            type="button"
            variant="default"
            onClick={handleSaveUserDataDir}
            disabled={savingUserDataDir || !userDataDirChanged}
            className="mr-1 text-xs font-normal px-2 min-h-0 h-6"
          >
            {savingUserDataDir && <Loader2 className="size-3.5 animate-spin" />}
            {t("common.save")}
          </Button>
        </div>
      </div>
    </div>
  );
}

export { GeneralSettings };

