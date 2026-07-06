"use client";

import { useCallback, useEffect, useState, Fragment } from "react";
import { http } from "@/shared/api/http";
import { Button } from "@/shared/ui/button";
import { Loader2, X } from "lucide-react";

interface ProviderInfo {
  provider: string;
  display_name: string;
  set: boolean;
  masked: string;
}

interface EnvResponse {
  providers: ProviderInfo[];
  user_data_dir: string;
}

function GeneralSettings() {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState<Record<string, string>>({});       // api_key by provider name
  const [savingProvider, setSavingProvider] = useState<string | null>(null);
  const [clearingProvider, setClearingProvider] = useState<string | null>(null);
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const DEFAULT_USER_DATA_DIR = "";
  const [userDataDir, setUserDataDir] = useState(DEFAULT_USER_DATA_DIR);
  const [userDataDirOriginal, setUserDataDirOriginal] = useState(DEFAULT_USER_DATA_DIR);
  const [savingUserDataDir, setSavingUserDataDir] = useState(false);

  const refresh = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const data = await http.get<EnvResponse>("/api/settings/env");
      setProviders(data.providers);
      if (data.user_data_dir) {
        setUserDataDir(data.user_data_dir);
        setUserDataDirOriginal(data.user_data_dir);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const getValue = useCallback(
    (providerName: string) => {
      if (providerName in dirty) return dirty[providerName];
      return "";
    },
    [dirty],
  );

  const handleApiKeyChange = useCallback((providerName: string, value: string) => {
    setError(null);
    setDirty((prev) => ({ ...prev, [providerName]: value }));
  }, []);

  const handleProviderSave = useCallback(
    async (providerName: string) => {
      setSavingProvider(providerName);
      setError(null);
      try {
        const apiKey = providerName in dirty ? dirty[providerName] : "";
        const payload: Record<string, unknown> = {
          providers: { [providerName]: { api_key: apiKey } },
        };
        await http.put("/api/settings/env", payload);
        setDirty((prev) => {
          const next = { ...prev };
          delete next[providerName];
          return next;
        });
        await refresh(false);
        setExpandedProvider(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "保存失败");
      } finally {
        setSavingProvider(null);
      }
    },
    [dirty, refresh],
  );

  const handleSaveUserDataDir = useCallback(async () => {
    setSavingUserDataDir(true);
    setError(null);
    try {
      await http.put("/api/settings/env", { user_data_dir: userDataDir });
      setUserDataDirOriginal(userDataDir);
      await refresh(false);
      // 通知 ChatPage 等组件 provider 配置已变更，重新拉取模型列表
      window.dispatchEvent(new CustomEvent("provider-config-changed"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSavingUserDataDir(false);
    }
  }, [userDataDir, refresh]);

  const handleClearProvider = useCallback(async (providerName: string) => {
    setClearingProvider(providerName);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        providers: { [providerName]: { api_key: "" } },
      };
      await http.put("/api/settings/env", payload);
      await refresh(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "清除失败");
    } finally {
      setClearingProvider(null);
    }
  }, [refresh]);

  const handleToggleProvider = useCallback((providerName: string) => {
    setExpandedProvider((prev) => (prev === providerName ? null : providerName));
  }, []);

  const userDataDirChanged = userDataDir !== userDataDirOriginal;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 隐藏浏览器原生密码字段切换按钮（眼睛图标） */}
      <style>{`
        input[type="password"]::-ms-reveal,
        input[type="password"]::-ms-clear,
        input[type="password"]::-webkit-credentials-auto-fill-button {
          display: none !important;
        }
      `}</style>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {providers.length === 0 && !loading && (
        <p className="text-sm text-muted-foreground">无可配置的 API Key</p>
      )}

      {/* 供应商列表 — 可折叠卡片 */}
      <div className="divide-y divide-border rounded-lg border border-border overflow-hidden bg-card">
        {providers.map((p) => {
          const isExpanded = expandedProvider === p.provider;
          const isKeyDirty = p.provider in dirty;
          const isConnected = p.set && !isKeyDirty;

          return (
            <Fragment key={p.provider}>
              {/* 供应商行头 */}
              <div
                className={`flex items-center gap-3 px-5 py-4 w-full ${
                  isConnected ? "" : "cursor-pointer hover:bg-muted/50"
                } transition-colors`}
              >
                {/* 点击区域：未连接时整行点击展开，已连接时不可点击 */}
                <div
                  role="button"
                  tabIndex={isConnected ? -1 : 0}
                  onClick={isConnected ? undefined : () => handleToggleProvider(p.provider)}
                  onKeyDown={
                    isConnected
                      ? undefined
                      : (e) => { if (e.key === "Enter" || e.key === " ") handleToggleProvider(p.provider); }
                  }
                  className="flex-1 min-w-0"
                >
                  <div className="text-sm font-semibold text-foreground">{p.display_name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    使用 {p.display_name} API 密钥连接
                  </div>
                </div>

                {/* 状态指示 */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <span
                    className={`size-1.5 rounded-full shrink-0 ${
                      isConnected
                        ? "bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.4)]"
                        : "bg-gray-300 dark:bg-gray-600"
                    }`}
                  />
                  <span
                    className={`text-xs font-medium ${
                      isConnected
                        ? "text-green-600 dark:text-green-400"
                        : "text-muted-foreground"
                    }`}
                  >
                    {isConnected ? "已连接" : "未连接"}
                  </span>
                </div>

                {/* 按钮区域：已连接 → 清除叉号 / 未连接 → 展开/折叠箭头 */}
                {isConnected ? (
                  <button
                    type="button"
                    onClick={() => handleClearProvider(p.provider)}
                    disabled={clearingProvider === p.provider}
                    className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-50 transition-colors"
                    title="清除 API Key"
                  >
                    {clearingProvider === p.provider ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <X className="size-4" />
                    )}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleToggleProvider(p.provider)}
                    aria-expanded={isExpanded}
                    className="shrink-0 p-1 rounded-md text-muted-foreground hover:bg-muted transition-colors"
                  >
                    <svg
                      className={`size-4 transition-transform duration-200 ${
                        isExpanded ? "rotate-180" : ""
                      }`}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                )}
              </div>

              {/* 展开的配置区域 */}
              {isExpanded && (
                <div className="px-5 py-4 bg-muted/30 space-y-3">
                  {/* API Key + Save 按钮嵌入 */}
                  <div className="relative border border-input rounded-md bg-card overflow-hidden focus-within:border-ring transition-colors">
                    <input
                      id={`key-${p.provider}`}
                      type="password"
                      className="w-full px-3 py-[9px] pr-[70px] text-sm bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground"
                      placeholder="输入 API Key"
                      value={getValue(p.provider)}
                      onChange={(e) => handleApiKeyChange(p.provider, e.target.value)}
                      autoComplete="new-password"
                    />
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      onClick={() => handleProviderSave(p.provider)}
                      disabled={!isKeyDirty || savingProvider === p.provider}
                      className="absolute right-0 top-0 bottom-0 m-[3px] text-xs font-semibold"
                    >
                      {savingProvider === p.provider && (
                        <Loader2 className="size-3.5 animate-spin" />
                      )}
                      Save
                    </Button>
                  </div>
                </div>
              )}
            </Fragment>
          );
        })}
      </div>

      {/* 用户数据存储目录 */}
      <div className="flex flex-col gap-1.5 pt-4 border-t border-border">
        <label htmlFor="env-user-data-dir" className="text-sm font-medium text-foreground">
          用户数据存储目录
        </label>
        <div className="relative border border-input rounded-md bg-card overflow-hidden focus-within:border-ring transition-colors">
          <input
            id="env-user-data-dir"
            type="text"
            className="w-full px-3 py-[9px] pr-[70px] text-sm bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground"
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
            className="absolute right-0 top-0 bottom-0 m-[3px] text-xs font-semibold"
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