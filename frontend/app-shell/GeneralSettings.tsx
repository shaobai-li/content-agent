"use client";

import { useCallback, useEffect, useState, Fragment } from "react";
import { http } from "@/shared/api/http";
import { Eye, EyeOff, Loader2 } from "lucide-react";

interface ProviderInfo {
  provider: string;
  display_name: string;
  set: boolean;
  masked: string;
  api_base: string;
}

interface EnvResponse {
  providers: ProviderInfo[];
  user_data_dir: string;
}

function GeneralSettings() {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [dirty, setDirty] = useState<Record<string, string>>({});       // api_key by provider name
  const [dirtyBase, setDirtyBase] = useState<Record<string, string>>({}); // api_base by provider name
  const [savingKey, setSavingKey] = useState<Record<string, boolean>>({});
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

  const getBaseValue = useCallback(
    (providerName: string) => {
      if (providerName in dirtyBase) return dirtyBase[providerName];
      const p = providers.find((p) => p.provider === providerName);
      return p?.api_base || "";
    },
    [dirtyBase, providers],
  );

  const handleApiKeyChange = useCallback((providerName: string, value: string) => {
    setDirty((prev) => ({ ...prev, [providerName]: value }));
  }, []);

  const handleApiBaseChange = useCallback((providerName: string, value: string) => {
    setDirtyBase((prev) => ({ ...prev, [providerName]: value }));
  }, []);

  const handleProviderSave = useCallback(
    async (providerName: string) => {
      setSavingKey((prev) => ({ ...prev, [providerName]: true }));
      setError(null);
      try {
        const apiKey = providerName in dirty ? dirty[providerName] : "";
        const apiBase = providerName in dirtyBase ? dirtyBase[providerName] : "";
        const payload: Record<string, unknown> = {
          providers: { [providerName]: { api_key: apiKey, api_base: apiBase } },
        };
        await http.put("/api/settings/env", payload);
        setDirty((prev) => {
          const next = { ...prev };
          delete next[providerName];
          return next;
        });
        setDirtyBase((prev) => {
          const next = { ...prev };
          delete next[providerName];
          return next;
        });
        await refresh(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "保存失败");
      } finally {
        setSavingKey((prev) => ({ ...prev, [providerName]: false }));
      }
    },
    [dirty, dirtyBase, refresh],
  );

  const handleSaveUserDataDir = useCallback(async () => {
    setSavingUserDataDir(true);
    setError(null);
    try {
      await http.put("/api/settings/env", { user_data_dir: userDataDir });
      setUserDataDirOriginal(userDataDir);
      await refresh(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSavingUserDataDir(false);
    }
  }, [userDataDir, refresh]);

  const toggleVisibility = useCallback((providerName: string) => {
    setVisible((prev) => ({ ...prev, [providerName]: !prev[providerName] }));
  }, []);

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
      {error && <p className="text-sm text-destructive">{error}</p>}

      {providers.length === 0 && !loading && (
        <p className="text-sm text-muted-foreground">无可配置的 API Key</p>
      )}

      {/* 供应商列表 — 可折叠卡片 */}
      <div className="divide-y divide-border rounded-lg border border-border overflow-hidden bg-card">
        {providers.map((p) => {
          const isExpanded = expandedProvider === p.provider;
          const isKeyDirty = p.provider in dirty;
          const isBaseDirty = p.provider in dirtyBase;
          const hasAnyDirty = isKeyDirty || isBaseDirty;
          const isConnected = p.set && !isKeyDirty;

          return (
            <Fragment key={p.provider}>
              {/* 供应商行头 — 点击展开/折叠 */}
              <div
                className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-muted/50 transition-colors select-none"
                onClick={() => handleToggleProvider(p.provider)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleToggleProvider(p.provider);
                  }
                }}
                tabIndex={0}
                role="button"
                aria-expanded={isExpanded}
              >
                <div className="flex-1 min-w-0">
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

                {/* 箭头 */}
                <svg
                  className={`size-4 text-muted-foreground shrink-0 transition-transform duration-200 ${
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
              </div>

              {/* 展开的配置区域 */}
              {isExpanded && (
                <div className="px-5 py-4 bg-muted/30 space-y-3">
                  {/* API Key */}
                  <div className="relative">
                    <input
                      id={`key-${p.provider}`}
                      type={visible[p.provider] ? "text" : "password"}
                      className="selection:bg-primary selection:text-primary-foreground border-input w-full rounded-md border bg-card px-3 py-2 pr-10 text-sm text-foreground shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-0"
                      placeholder={p.set ? "输入新 Key 覆盖现有值" : "输入 API Key"}
                      value={getValue(p.provider)}
                      onChange={(e) => handleApiKeyChange(p.provider, e.target.value)}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => toggleVisibility(p.provider)}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
                      tabIndex={-1}
                    >
                      {visible[p.provider] ? (
                        <EyeOff className="size-4" />
                      ) : (
                        <Eye className="size-4" />
                      )}
                    </button>
                  </div>

                  {/* API Base URL */}
                  <div className="relative">
                    <input
                      id={`base-${p.provider}`}
                      type="text"
                      className={`selection:bg-primary selection:text-primary-foreground border-input w-full rounded-md border bg-card px-3 py-2 pr-3 text-sm text-foreground shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-0 ${
                        isBaseDirty ? "border-amber-500" : ""
                      }`}
                      placeholder="API Base URL（留空使用默认地址）"
                      value={getBaseValue(p.provider)}
                      onChange={(e) => handleApiBaseChange(p.provider, e.target.value)}
                    />
                  </div>

                  {/* Save 按钮 */}
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleProviderSave(p.provider)}
                      disabled={!hasAnyDirty || (savingKey[p.provider] ?? false)}
                      className="rounded-md bg-foreground px-3 py-1.5 text-sm text-background hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1.5 transition-opacity"
                    >
                      {(savingKey[p.provider] ?? false) && (
                        <Loader2 className="size-3.5 animate-spin" />
                      )}
                      Save
                    </button>
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
        <div className="relative">
          <input
            id="env-user-data-dir"
            type="text"
            className="selection:bg-primary selection:text-primary-foreground border-input w-full rounded-md border bg-card px-3 py-2 pr-20 text-sm text-foreground shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-0"
            placeholder="留空则使用默认位置"
            value={userDataDir}
            onChange={(e) => setUserDataDir(e.target.value)}
          />
          <button
            type="button"
            onClick={handleSaveUserDataDir}
            disabled={savingUserDataDir || !userDataDirChanged}
            className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md bg-foreground px-2.5 py-1 text-xs font-semibold text-background hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1 transition-opacity"
          >
            {savingUserDataDir && <Loader2 className="size-3 animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

export { GeneralSettings };