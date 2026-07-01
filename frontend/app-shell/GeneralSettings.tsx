"use client";

import { useCallback, useEffect, useState, Fragment } from "react";
import { http } from "@/shared/api/http";
import { Loader2 } from "lucide-react";

interface ProviderEnv {
  provider: string;
  display_name: string;
  env_key: string;
  set: boolean;
  masked: string;
}

interface EnvResponse {
  providers: ProviderEnv[];
  user_data_dir: string;
}

// 前端硬编码的供应商列表，无需后端配合即可展示
const PROVIDER_DEFS: { provider: string; display_name: string; env_key: string }[] = [
  { provider: "deepseek", display_name: "DeepSeek", env_key: "DEEPSEEK_API_KEY" },
  { provider: "openai", display_name: "OpenAI", env_key: "OPENAI_API_KEY" },
  { provider: "moonshot", display_name: "Moonshot", env_key: "MOONSHOT_API_KEY" },
  { provider: "minimax", display_name: "Minimax", env_key: "MINIMAX_API_KEY" },
  { provider: "zhipu", display_name: "ZHIPU", env_key: "ZHIPUAI_API_KEY" },
];

function GeneralSettings() {
  const [providers, setProviders] = useState<ProviderEnv[]>(() =>
    PROVIDER_DEFS.map((p) => ({ ...p, set: false, masked: "" })),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<Record<string, boolean>>({});
  const [dirty, setDirty] = useState<Record<string, string>>({});
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
      // 将 API 返回的 provider 状态合并到前端硬编码列表中
      const apiMap = new Map(data.providers.map((p) => [p.env_key, p]));
      setProviders(
        PROVIDER_DEFS.map((def) => {
          const api = apiMap.get(def.env_key);
          return api ?? { ...def, set: false, masked: "" };
        }),
      );
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
    (envKey: string) => {
      if (envKey in dirty) return dirty[envKey];
      return "";
    },
    [dirty],
  );

  const handleChange = useCallback(
    (envKey: string, value: string) => {
      setDirty((prev) => ({ ...prev, [envKey]: value }));
    },
    [],
  );

  const handleProviderSave = useCallback(async (envKey: string) => {
    setSavingKey((prev) => ({ ...prev, [envKey]: true }));
    setError(null);
    try {
      const value = dirty[envKey] ?? "";
      await http.put("/api/settings/env", { [envKey]: value });
      setDirty((prev) => {
        const next = { ...prev };
        delete next[envKey];
        return next;
      });
      await refresh(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSavingKey((prev) => ({ ...prev, [envKey]: false }));
    }
  }, [dirty, refresh]);

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

  const handleToggleProvider = useCallback((envKey: string) => {
    setExpandedProvider((prev) => (prev === envKey ? null : envKey));
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

      {/* 供应商列表 — 白底卡片 */}
      <div className="bg-white border border-border rounded-lg overflow-hidden">
        {providers.map((p) => {
          const isExpanded = expandedProvider === p.env_key;
          const isDirty = p.env_key in dirty;
          const val = getValue(p.env_key);
          const hasDirtyValue = isDirty && val !== "";
          const isSaving = savingKey[p.env_key] ?? false;
          const isConnected = p.set && !isDirty;

          return (
            <Fragment key={p.env_key}>
              {/* 供应商行头 */}
              <div
                className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-[#fafafa] border-b border-[#f0f0f0] last:border-b-0 transition-colors"
                onClick={() => handleToggleProvider(p.env_key)}
              >
                {/* 名称 */}
                <div className="flex-1 min-w-0">
                  <div className="text-[15px] font-semibold text-[#111827]">{p.display_name}</div>
                  <div className="text-[13px] text-[#9ca3af] mt-0.5">
                    使用{p.display_name} API密钥连接
                  </div>
                </div>

                {/* 状态指示 */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      isConnected
                        ? "bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.4)]"
                        : "bg-gray-300"
                    }`}
                  />
                  <span
                    className={`text-xs font-medium ${
                      isConnected ? "text-green-600" : "text-gray-400"
                    }`}
                  >
                    {isConnected ? "已连接" : "未连接"}
                  </span>
                </div>

                {/* 箭头 */}
                <svg
                  className={`w-4 h-4 text-[#c4c4c4] shrink-0 transition-all duration-200 group-hover:text-[#9ca3af] ${
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

              {/* 展开的配置区域 — save 按钮嵌在输入框内部 */}
              {isExpanded && (
                <div className="px-5 py-4 bg-[#fafafa] border-b border-[#f0f0f0] last:border-b-0">
                  <div className="relative border border-[#e5e7eb] rounded-md bg-white overflow-hidden">
                    <input
                      id={`env-${p.env_key}`}
                      type="password"
                      className="w-full px-3 py-[8px] pr-[65px] text-[13px] font-mono bg-transparent border-none outline-none text-[#111827] placeholder-[#9ca3af]"
                      placeholder={p.set ? "输入新 Key 覆盖现有值" : "输入 API Key"}
                      value={val}
                      onChange={(e) => handleChange(p.env_key, e.target.value)}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => handleProviderSave(p.env_key)}
                      disabled={!hasDirtyValue || isSaving}
                      className="absolute right-0 top-0 bottom-0 flex items-center rounded-md px-3 m-0.5 text-xs font-semibold bg-[#111827] text-white hover:bg-[#1f2937] active:bg-[#374151] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isSaving && <Loader2 className="size-3.5 animate-spin inline mr-1" />}
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
      <div className="flex flex-col gap-1.5 mt-4 pt-4 border-t border-border">
        <label htmlFor="env-user-data-dir" className="text-sm font-medium text-foreground">
          用户数据存储目录
        </label>
        <div className="relative border border-[#e5e7eb] rounded-md bg-white overflow-hidden">
          <input
            id="env-user-data-dir"
            type="text"
            className="w-full px-3 py-[8px] pr-[65px] text-[13px] bg-transparent border-none outline-none text-[#111827] placeholder-[#9ca3af]"
            placeholder="留空则使用默认位置"
            value={userDataDir}
            onChange={(e) => setUserDataDir(e.target.value)}
          />
          <button
            type="button"
            onClick={handleSaveUserDataDir}
            disabled={savingUserDataDir || !userDataDirChanged}
            className="absolute right-0 top-0 bottom-0 flex items-center rounded-md px-3 m-0.5 text-xs font-semibold bg-[#111827] text-white hover:bg-[#1f2937] active:bg-[#374151] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {savingUserDataDir && <Loader2 className="size-3.5 animate-spin inline mr-1" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

export { GeneralSettings };
