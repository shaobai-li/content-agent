"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { AgentInfoCard } from "./AgentInfoCard";
import { NewAgentDialog } from "./NewAgentDialog";
import {
  fetchAgentsSummary,
  type AgentSummary,
} from "@/shared/api/management";
import { getHiddenAgentIds } from "@/entities/agent/visibility";
import { loadAgents } from "@/entities/agent/agent.registry";
import { useTranslation } from "react-i18next";

interface ManagementPanelProps {
  agentId: string;
}

type LoadingState = "loading" | "loaded" | "error";

export function ManagementPanel({ agentId }: ManagementPanelProps) {
  const { t } = useTranslation();
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [loadingState, setLoadingState] = useState<LoadingState>("loading");
  const [hiddenIds, setHiddenIds] = useState<string[]>(() =>
    getHiddenAgentIds(),
  );
  const [dialogOpen, setDialogOpen] = useState(false);

  const refreshAgents = () => {
    fetchAgentsSummary()
      .then((data) => {
        setAgents(data);
        setLoadingState("loaded");
      })
      .catch(() => {
        setLoadingState("error");
      });
  };

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

  const handleAgentCreated = async () => {
    setDialogOpen(false);
    refreshView();
  };

  const handleAgentDeleted = async () => {
    refreshView();
  };

  /** 刷新管理面板和侧边栏 */
  const refreshView = async () => {
    refreshAgents();
    await loadAgents();
    window.dispatchEvent(new CustomEvent("agent-registry-refresh"));
  };

  if (loadingState === "loading") {
    return (
      <div className="flex min-h-0 min-w-0 w-full flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      </div>
    );
  }

  if (loadingState === "error") {
    return (
      <div className="flex min-h-0 min-w-0 w-full flex-1 items-center justify-center">
        <p className="text-sm text-destructive">{t("agentManagement.loadFailedRetry")}</p>
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className="flex min-h-0 min-w-0 w-full flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">{t("agentManagement.empty")}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col gap-6 overflow-y-auto">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {agents.map((agent) => (
          <AgentInfoCard
            key={agent.name}
            agentId={agent.name}
            title={agent.title}
            locked={agent.locked}
            visible={!hiddenIds.includes(agent.name)}
            model={agent.model}
            sessionCount={agent.session_count}
            lastReplyTime={agent.last_reply_time}
            lastSessionTitle={agent.last_session_title}
            onDeleted={handleAgentDeleted}
          />
        ))}
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="flex min-h-36 w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-transparent py-6 shadow-none outline-none transition-colors hover:border-muted-foreground/50 hover:bg-muted/30 focus-visible:border-border focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/45 text-muted-foreground">
            <Plus className="size-5" aria-hidden />
          </span>
          <span className="text-sm font-medium text-muted-foreground">
            {t("agentManagement.newAgentButton")}
          </span>
        </button>
      </div>

      <NewAgentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={handleAgentCreated}
      />
    </div>
  );
}
