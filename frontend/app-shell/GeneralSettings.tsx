"use client";

import { useCallback, useEffect, useState } from "react";
import { http } from "@/shared/api/http";
import { Eye, EyeOff, Loader2 } from "lucide-react";

interface ProviderEnv {
  provider: string;
  display_name: string;
  env_key: string;
  set: boolean;
  masked: string;
}

interface EnvResponse {
  providers: ProviderEnv[];
}

function GeneralSettings() {
  const [providers, setProviders] = useState<ProviderEnv[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [dirty, setDirty] = useState<Record<string, string>>({});
  const [dataDir, setDataDir] = useState("content-agent-data\\data");

  const refresh = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const data = await http.get<EnvResponse>("/api/settings/env");
      setProviders(data.providers);
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

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await http.put("/api/settings/env", dirty);
      setDirty({});
      await refresh(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }, [dirty, refresh]);

  const toggleVisibility = useCallback((envKey: string) => {
    setVisible((prev) => ({ ...prev, [envKey]: !prev[envKey] }));
  }, []);

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
        const isDirty = p.env_key in dirty;
        const val = getValue(p.env_key);
        const showClear = isDirty && val === "";

        return (
          <div key={p.env_key} className="flex flex-col gap-1.5">
            <label
              htmlFor={`env-${p.env_key}`}
              className="text-sm font-medium text-foreground"
            >
              {p.display_name} API Key
              {p.set && !isDirty && (
                <span className="ml-2 text-xs text-muted-foreground font-normal">
                  {p.masked}
                </span>
              )}
            </label>
            <div className="relative">
              <input
                id={`env-${p.env_key}`}
                type={visible[p.env_key] ? "text" : "password"}
                className="selection:bg-primary selection:text-primary-foreground border-input w-full rounded-md border bg-muted px-3 py-2 pr-16 text-sm text-foreground shadow-xs transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 focus-visible:border-input focus-visible:ring-0"
                placeholder={p.set ? "输入新 Key 覆盖现有值" : "输入 API Key"}
                value={val}
                onChange={(e) => handleChange(p.env_key, e.target.value)}
                autoComplete="new-password"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-0.5">
                {isDirty && val !== "" && (
                  <button
                    type="button"
                    onClick={() => handleChange(p.env_key, "")}
                    className="rounded p-1 text-muted-foreground hover:text-foreground"
                    title="清空"
                  >
                    <span className="text-xs">✕</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => toggleVisibility(p.env_key)}
                  className="rounded p-1 text-muted-foreground hover:text-foreground"
                  title={visible[p.env_key] ? "隐藏" : "显示"}
                >
                  {visible[p.env_key] ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
        );
      })}

      {providers.length === 0 && !loading && (
        <p className="text-sm text-muted-foreground">无可配置的 API Key</p>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="env-DATA_DIR" className="text-sm font-medium text-foreground">
          DATA_DIR
        </label>
        <div className="relative">
          <input
            id="env-DATA_DIR"
            type="text"
            className="selection:bg-primary selection:text-primary-foreground border-input w-full rounded-md border bg-muted px-3 py-2 pr-3 text-sm text-foreground shadow-xs transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 focus-visible:border-input focus-visible:ring-0"
            placeholder="DATA_DIR路径"
            value={dataDir}
            onChange={(e) => setDataDir(e.target.value)}
          />
        </div>
      </div>

      <div className="flex justify-end mt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || Object.keys(dirty).length === 0}
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
