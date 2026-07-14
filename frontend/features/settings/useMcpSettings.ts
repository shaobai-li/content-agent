"use client";

import { useState, useEffect, useCallback } from "react";
import { http } from "@/shared/api/http";

export interface McpServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  enabled_tools?: string[];
  tool_timeout?: number;
}

interface McpSettingsResponse {
  servers: Record<string, McpServerConfig>;
}

export function useMcpSettings() {
  const [servers, setServers] = useState<Record<string, McpServerConfig>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await http.get<McpSettingsResponse>("/api/settings/mcp");
      setServers(data.servers || {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载 MCP 配置失败");
    } finally {
      setLoading(false);
    }
  }, []);

  const save = useCallback(async (updated: Record<string, McpServerConfig>): Promise<boolean> => {
    try {
      await http.put("/api/settings/mcp", { servers: updated });
      setServers(updated);
      setError(null);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存 MCP 配置失败");
      return false;
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { servers, loading, error, load, save };
}
