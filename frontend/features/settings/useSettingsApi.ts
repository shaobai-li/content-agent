"use client";

import { useState, useEffect, useCallback } from "react";
import { http } from "@/shared/api/http";

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
      const data = await http.get<PromptListResponse>(`/api/agents/${agentId}/prompts`);
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
        await http.put(`/api/agents/${agentId}/prompts/${filename}`, { content });
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
      const data = await http.get<SkillListResponse>(`/api/agents/${agentId}/skills`);
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
        await http.put(`/api/agents/${agentId}/skills/${skillId}/disable`, { disabled });
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
      try {
        await http.post(`/api/agents/${agentId}/skills/upload`, {
          folder_name: folderName,
          files,
        });
        await load();
      } catch (err) {
        throw new Error(
          err instanceof Error ? err.message : "上传失败",
        );
      }
    },
    [agentId, load],
  );

  const remove = useCallback(
    async (skillId: string) => {
      try {
        await http.delete(`/api/agents/${agentId}/skills/${skillId}`);
        await load();
      } catch (err) {
        throw new Error(
          err instanceof Error ? err.message : "删除失败",
        );
      }
    },
    [agentId, load],
  );

  useEffect(() => {
    load();
  }, [load]);

  return { skills, loading, error, load, toggleDisable, upload, remove };
}
