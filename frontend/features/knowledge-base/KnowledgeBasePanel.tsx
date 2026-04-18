"use client";

import type { AgentId } from "@/entities/agent/model";
import { DataPanel } from "../data/DataPanel";
import { createKnowledgeBasePanelConfig } from "../data/dataPanelConfigRegistry";
import { KnowledgeBaseListPanel } from "./KnowledgeBaseListPanel";
import { useKnowledgeBaseSelection } from "./useKnowledgeBaseSelection";
import { useKnowledgeBases } from "./useKnowledgeBases";

interface KnowledgeBasePanelProps {
  agentId: AgentId;
}

export function KnowledgeBasePanel({ agentId }: KnowledgeBasePanelProps) {
  const { databases } = useKnowledgeBases(agentId);
  const { databaseId } = useKnowledgeBaseSelection();
  const selectedDatabase = databases.find((database) => database.id === databaseId) ?? null;

  if (!selectedDatabase) {
    return <KnowledgeBaseListPanel agentId={agentId} />;
  }

  const config = createKnowledgeBasePanelConfig(agentId, selectedDatabase.id);

  return <DataPanel key={selectedDatabase.id} {...config} />;
}
