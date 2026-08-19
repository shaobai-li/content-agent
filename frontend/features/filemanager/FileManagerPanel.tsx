"use client";

import type { AgentId } from "@/entities/agent/model";

interface FileManagerPanelProps {
  agentId: AgentId;
}

export function FileManagerPanel({ agentId }: FileManagerPanelProps) {
  return (
    <div className="flex h-full items-center justify-center text-muted-foreground">
      文件管理（开发中 · agent: {agentId}）
    </div>
  );
}
