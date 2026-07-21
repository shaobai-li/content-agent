"use client";

import { useCallback, useEffect, useState } from "react";
import { http } from "@/shared/api/http";
import { Button } from "@/shared/ui/button";
import { Loader2 } from "lucide-react";
import { LanguageSelector } from "./LanguageSelector";

interface EnvResponse {
  providers: { provider: string; display_name: string; set: boolean; masked: string }[];
  user_data_dir: string;
}

function GeneralSettings() {
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
      setError(err instanceof Error ? err.message : "加载失败");
    }
  }, []);

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
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSavingUserDataDir(false);
    }
  }, [userDataDir, refresh]);

  const userDataDirChanged = userDataDir !== userDataDirOriginal;

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* 语言切换 — UI 骨架，功能待后续实现 */}
      <LanguageSelector />

      <div className="border-t border-border" />

      {/* 用户数据存储目录 */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="env-user-data-dir" className="text-sm font-medium text-foreground">
          用户数据存储目录
        </label>
        <div className="relative border border-input rounded-md bg-card overflow-hidden transition-colors">
          <input
            id="env-user-data-dir"
            type="text"
            className="w-full px-3 py-2.5 pr-[70px] text-sm bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground"
            placeholder="留空则使用默认位置"
            value={userDataDir}
            onChange={(e) => setUserDataDir(e.target.value)}
          />
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={handleSaveUserDataDir}
            disabled={savingUserDataDir || !userDataDirChanged}
            className="absolute right-0 top-0 bottom-0 m-0.5 text-xs font-semibold"
          >
            {savingUserDataDir && <Loader2 className="size-3.5 animate-spin" />}
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

export { GeneralSettings };
