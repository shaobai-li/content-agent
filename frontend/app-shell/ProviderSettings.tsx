"use client";

import { useCallback, useEffect, useState, Fragment } from "react";
import { http } from "@/shared/api/http";
import { Button } from "@/shared/ui/button";
import { Loader2, X } from "lucide-react";
import { useTranslation } from "react-i18next";

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

function ProviderSettings() {
  const { t } = useTranslation();
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState<Record<string, string>>({});       // api_key by provider name
  const [savingProvider, setSavingProvider] = useState<string | null>(null);
  const [clearingProvider, setClearingProvider] = useState<string | null>(null);
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);

  const refresh = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const data = await http.get<EnvResponse>("/api/settings/env");
      setProviders(data.providers);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error.loadFailed"));
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [t]);

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
        setError(err instanceof Error ? err.message : t("common.error.saveFailed"));
      } finally {
        setSavingProvider(null);
      }
    },
    [dirty, refresh, t],
  );

  const handleClearProvider = useCallback(async (providerName: string) => {
    setClearingProvider(providerName);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        providers: { [providerName]: { api_key: "" } },
      };
      await http.put("/api/settings/env", payload);
      await refresh(false);
      setDirty((prev) => {
        const next = { ...prev };
        delete next[providerName];
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("providers.error.clearFailed"));
    } finally {
      setClearingProvider(null);
    }
  }, [refresh, t]);

  const handleToggleProvider = useCallback((providerName: string) => {
    setExpandedProvider((prev) => (prev === providerName ? null : providerName));
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

      {providers.length === 0 && !loading && (
        <p className="text-sm text-muted-foreground">{t("providers.empty")}</p>
      )}

      {/* 渚涘簲鍟嗗垪琛?鈥?鍙姌鍙犲崱鐗?*/}
      <div className="divide-y divide-border rounded-lg border border-border overflow-hidden bg-card">
        {providers.map((p) => {
          const isExpanded = expandedProvider === p.provider;
          const isKeyDirty = p.provider in dirty;
          const isConnected = p.set && !isKeyDirty;

          return (
            <Fragment key={p.provider}>
              {/* 渚涘簲鍟嗚澶?*/}
              <div
                className={`flex items-center gap-3 px-5 py-4 w-full ${
                  isConnected ? "" : "cursor-pointer hover:bg-muted/50"
                } transition-colors`}
              >
                {/* 鐐瑰嚮鍖哄煙锛氭湭杩炴帴鏃舵暣琛岀偣鍑诲睍寮€锛屽凡杩炴帴鏃朵笉鍙偣鍑?*/}
                <div
                  role={isConnected ? undefined : "button"}
                  tabIndex={isConnected ? undefined : 0}
                  onClick={isConnected ? undefined : () => handleToggleProvider(p.provider)}
                  onKeyDown={
                    isConnected
                      ? undefined
                      : (e) => { if (e.key === "Enter" || e.key === " ") handleToggleProvider(p.provider); }
                  }
                  aria-disabled={isConnected || undefined}
                  className="flex-1 min-w-0"
                >
                  <div className="text-sm font-semibold text-foreground">{p.display_name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {t("providers.connectUsing", { name: p.display_name })}
                  </div>
                </div>

                {/* 鐘舵€佹寚绀?*/}
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
                    {isConnected ? t("providers.connected") : t("providers.disconnected")}
                  </span>
                </div>

                {/* 鎸夐挳鍖哄煙锛氬凡杩炴帴 鈫?娓呴櫎鍙夊彿 / 鏈繛鎺?鈫?灞曞紑/鎶樺彔绠ご */}
                {isConnected ? (
                  <button
                    type="button"
                    onClick={() => handleClearProvider(p.provider)}
                    disabled={clearingProvider === p.provider}
                    className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-50 transition-colors"
                    title={t("providers.clearTitle")}
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

              {/* 灞曞紑鐨勯厤缃尯鍩?*/}
              {isExpanded && (
                <div className="px-5 py-4 bg-muted/30 space-y-3">
                  {/* API Key + Save 鎸夐挳宓屽叆 */}
                  <div className="relative border border-input rounded-md bg-card overflow-hidden focus-within:border-ring transition-colors">
                    <input
                      id={`key-${p.provider}`}
                      type="password"
                      className="w-full px-3 py-2.5 pr-[70px] text-sm bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground"
                      placeholder={t("providers.inputPlaceholder")}
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
                      className="absolute right-0 top-0 bottom-0 m-0.5 text-xs font-semibold"
                    >
                      {savingProvider === p.provider && (
                        <Loader2 className="size-3.5 animate-spin" />
                      )}
                      {t("common.save")}
                    </Button>
                  </div>
                </div>
              )}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

export { ProviderSettings };

