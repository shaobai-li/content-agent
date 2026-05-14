"use client";

import { useState, useEffect, useCallback } from "react";
import { API_BASE_URL } from "@/shared/api/config";

// ── Types ────────────────────────────────────────────────────────

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

// ── Hook: skills ─────────────────────────────────────────────────

export function useSkills(agentId: string) {
  const [skills, setSkills] = useState<SkillInfo[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/agents/${agentId}/skills`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: SkillListResponse = await res.json();
      setSkills(data.skills);
    } catch {
      // 静默失败，后续 commit 加入错误处理
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  const toggleDisable = useCallback(
    async (skillId: string, disabled: boolean) => {
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

  useEffect(() => {
    load();
  }, [load]);

  return { skills, loading, load, toggleDisable, upload };
}
