"use client";

import type { AgentId } from "@/entities/agent/model";
import { DataPanel } from "../data/DataPanel";
import { dataPanelConfigRegistry } from "../data/dataPanelConfigRegistry";
import { KnowledgeBaseListPanel } from "./KnowledgeBaseListPanel";
import { useKnowledgeBaseSelection } from "./useKnowledgeBaseSelection";

interface KnowledgeBasePanelProps {
  agentId: AgentId;
}

export function KnowledgeBasePanel({ agentId }: KnowledgeBasePanelProps) {
  const { selectedDatabase } = useKnowledgeBaseSelection(agentId);
  const config = dataPanelConfigRegistry[agentId];

  if (!selectedDatabase) {
    return <KnowledgeBaseListPanel agentId={agentId} />;
  }

  if (!config) {
    return <div className="p-4 text-muted-foreground">暂无数据面板</div>;
  }

  return <DataPanel {...config} />;
}
