"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { AgentInfoCard } from "./AgentInfoCard";
import {
  fetchAgentsSummary,
  type AgentSummary,
} from "@/shared/api/management";
import { getHiddenAgentIds } from "@/entities/agent/visibility";

interface ManagementPanelProps {
  agentId: string;
}

type LoadingState = "loading" | "loaded" | "error";

export function ManagementPanel({ agentId }: ManagementPanelProps) {
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [loadingState, setLoadingState] = useState<LoadingState>("loading");
  const [hiddenIds, setHiddenIds] = useState<string[]>(() =>
    getHiddenAgentIds(),
  );

  // 监听来自其他组件（如 Sidebar）的 visibility 变更
  useEffect(() => {
    const handler = () => setHiddenIds(getHiddenAgentIds());
    window.addEventListener("agent-visibility-changed", handler);
    return () => window.removeEventListener("agent-visibility-changed", handler);
  }, []);

  useEffect(() => {
    let cancelled = false;

    fetchAgentsSummary()
      .then((data) => {
        if (cancelled) return;
        setAgents(data);
        setLoadingState("loaded");
      })
      .catch(() => {
        if (cancelled) return;
        setLoadingState("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (loadingState === "loading") {
    return (
      <div className="flex min-h-0 min-w-0 w-full flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">加载中...</p>
      </div>
    );
  }

  if (loadingState === "error") {
    return (
      <div className="flex min-h-0 min-w-0 w-full flex-1 items-center justify-center">
        <p className="text-sm text-destructive">加载失败，请稍后重试</p>
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className="flex min-h-0 min-w-0 w-full flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">暂无智能体</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {agents.map((agent) => (
          <AgentInfoCard
            key={agent.id}
            agentId={agent.id}
            name={agent.name}
            visible={!hiddenIds.includes(agent.id)}
            model={agent.model}
            sessionCount={agent.session_count}
            lastReplyTime={agent.last_reply_time}
            lastSessionTitle={agent.last_session_title}
          />
        ))}
        <button
          type="button"
          onClick={() => {}}
          className="flex min-h-36 w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-transparent py-6 shadow-none outline-none transition-colors hover:border-muted-foreground/50 hover:bg-muted/30 focus-visible:border-border focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/45 text-muted-foreground">
            <Plus className="size-5" aria-hidden />
          </span>
          <span className="text-sm font-medium text-muted-foreground">
            New Agent
          </span>
        </button>
      </div>
    </div>
  );
}
