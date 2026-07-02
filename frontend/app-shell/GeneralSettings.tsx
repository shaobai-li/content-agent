"use client";

import { useCallback, useEffect, useState } from "react";
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [dirty, setDirty] = useState<Record<string, string>>({});       // api_key by provider name
  const [dirtyBase, setDirtyBase] = useState<Record<string, string>>({}); // api_base by provider name
  const DEFAULT_USER_DATA_DIR = "";
  const [userDataDir, setUserDataDir] = useState(DEFAULT_USER_DATA_DIR);
  const [userDataDirOriginal, setUserDataDirOriginal] = useState(DEFAULT_USER_DATA_DIR);

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

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {};

      // Build providers payload
      const providersPayload: Record<string, { api_key: string; api_base: string }> = {};
      for (const p of providers) {
        const apiKey = p.provider in dirty ? dirty[p.provider] : "";
        const apiBase = p.provider in dirtyBase ? dirtyBase[p.provider] : p.api_base;
        if (p.provider in dirty || p.provider in dirtyBase) {
          providersPayload[p.provider] = { api_key: apiKey, api_base: apiBase };
        }
      }
      if (Object.keys(providersPayload).length > 0) {
        payload.providers = providersPayload;
      }

      if (userDataDir !== userDataDirOriginal) {
        payload.user_data_dir = userDataDir;
      }
      await http.put("/api/settings/env", payload);
      setDirty({});
      setDirtyBase({});
      setUserDataDirOriginal(userDataDir);
      await refresh(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }, [dirty, dirtyBase, providers, refresh, userDataDir, userDataDirOriginal]);

  const toggleVisibility = useCallback((providerName: string) => {
    setVisible((prev) => ({ ...prev, [providerName]: !prev[providerName] }));
  }, []);

  const hasChanges =
    Object.keys(dirty).length > 0 || Object.keys(dirtyBase).length > 0 || userDataDir !== userDataDirOriginal;

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

      {providers.map((p) => {
        const apiKey = getValue(p.provider);
        const apiBase = getBaseValue(p.provider);
        const isKeyDirty = p.provider in dirty;
        const isBaseDirty = p.provider in dirtyBase;

        return (
          <div key={p.provider} className="flex flex-col gap-1.5">
            <label
              htmlFor={`key-${p.provider}`}
              className="text-sm font-medium text-foreground"
            >
              {p.display_name} API Key
              {p.set && !isKeyDirty && (
                <span className="ml-2 text-xs text-muted-foreground font-normal">
                  {p.masked}
                </span>
              )}
            </label>
            <div className="relative">
              <input
                id={`key-${p.provider}`}
                type={visible[p.provider] ? "text" : "password"}
                className="selection:bg-primary selection:text-primary-foreground border-input w-full rounded-md border bg-muted px-3 py-2 pr-16 text-sm text-foreground shadow-xs transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 focus-visible:border-input focus-visible:ring-0"
                placeholder={p.set ? "输入新 Key 覆盖现有值" : "输入 API Key"}
                value={apiKey}
                onChange={(e) => handleApiKeyChange(p.provider, e.target.value)}
                autoComplete="new-password"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-0.5">
                {isKeyDirty && apiKey !== "" && (
                  <button
                    type="button"
                    onClick={() => handleApiKeyChange(p.provider, "")}
                    className="rounded p-1 text-muted-foreground hover:text-foreground"
                    title="清空"
                  >
                    <span className="text-xs">✕</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => toggleVisibility(p.provider)}
                  className="rounded p-1 text-muted-foreground hover:text-foreground"
                  title={visible[p.provider] ? "隐藏" : "显示"}
                >
                  {visible[p.provider] ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
            </div>
            {/* API Base URL */}
            <label
              htmlFor={`base-${p.provider}`}
              className="text-xs font-medium text-muted-foreground"
            >
              API Base URL
            </label>
            <input
              id={`base-${p.provider}`}
              type="text"
              className={`selection:bg-primary selection:text-primary-foreground border-input w-full rounded-md border bg-muted px-3 py-2 pr-3 text-sm text-foreground shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-input focus-visible:ring-0 ${isBaseDirty ? "border-amber-500" : ""}`}
              placeholder="留空则使用默认地址"
              value={apiBase}
              onChange={(e) => handleApiBaseChange(p.provider, e.target.value)}
            />
          </div>
        );
      })}

      {providers.length === 0 && !loading && (
        <p className="text-sm text-muted-foreground">无可配置的 API Key</p>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="env-user-data-dir" className="text-sm font-medium text-foreground">
          用户数据存储目录
        </label>
        <div className="relative">
          <input
            id="env-user-data-dir"
            type="text"
            className="selection:bg-primary selection:text-primary-foreground border-input w-full rounded-md border bg-muted px-3 py-2 pr-3 text-sm text-foreground shadow-xs transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 focus-visible:border-input focus-visible:ring-0"
            placeholder="留空则使用默认位置"
            value={userDataDir}
            onChange={(e) => setUserDataDir(e.target.value)}
          />
        </div>
      </div>

      <div className="flex justify-end mt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !hasChanges}
          className="rounded-md bg-foreground px-3 py-1.5 text-sm text-background hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          {saving && <Loader2 className="size-3.5 animate-spin" />}
          Save
        </button>
      </div>
    </div>
  );
}

export { GeneralSettings };
