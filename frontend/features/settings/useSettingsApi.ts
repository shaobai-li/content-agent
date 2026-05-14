"use client";

import { useState, useEffect, useCallback } from "react";
import { API_BASE_URL } from "@/shared/api/config";

// ── Types ────────────────────────────────────────────────────────

export type PromptFiles = Record<string, string>;

export interface SkillInfo {
  id: string;
  name: string;
  description: string;
  source: "bundled" | "user";
  disabled: boolean;
}

export interface SkillListResponse {
  skills: SkillInfo[];
}

export interface PromptListResponse {
  files: PromptFiles;
}

// ── Hook: prompts ────────────────────────────────────────────────

export function usePrompts(agentId: string) {
  const [files, setFiles] = useState<PromptFiles | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/agents/${agentId}/prompts`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: PromptListResponse = await res.json();
      setFiles(data.files);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载 prompts 失败");
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  const save = useCallback(
    async (filename: string, content: string) => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/agents/${agentId}/prompts/${filename}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content }),
          },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        // 更新本地状态
        setFiles((prev) =>
          prev ? { ...prev, [filename]: content } : prev,
        );
        return true;
      } catch (err) {
        throw err;
      }
    },
    [agentId],
  );

  useEffect(() => {
    load();
  }, [load]);

  return { files, loading, error, load, save };
}

// ── Hook: skills ─────────────────────────────────────────────────

export function useSkills(agentId: string) {
  const [skills, setSkills] = useState<SkillInfo[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/agents/${agentId}/skills`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: SkillListResponse = await res.json();
      setSkills(data.skills);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载 skills 失败");
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  const toggleDisable = useCallback(
    async (skillId: string, disabled: boolean) => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/agents/${agentId}/skills/${skillId}/disable`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ disabled }),
          },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setSkills((prev) =>
          prev
            ? prev.map((s) =>
                s.id === skillId ? { ...s, disabled } : s,
              )
            : prev,
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "操作失败");
        await load(); // 回滚乐观更新
      }
    },
    [agentId],
  );

  const upload = useCallback(
    async (folderName: string, files: Record<string, string>) => {
      const res = await fetch(
        `${API_BASE_URL}/api/agents/${agentId}/skills/upload`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folder_name: folderName, files }),
        },
      );
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(
          detail?.detail || `上传失败 (HTTP ${res.status})`,
        );
      }
      await load();
    },
    [agentId, load],
  );

  const remove = useCallback(
    async (skillId: string) => {
      const res = await fetch(
        `${API_BASE_URL}/api/agents/${agentId}/skills/${skillId}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    },
    [agentId, load],
  );

  useEffect(() => {
    load();
  }, [load]);

  return { skills, loading, error, load, toggleDisable, upload, remove };
}
