"use client";

import type { AgentId } from "@/entities/agent/model";
import { DataHeader } from "../data/DataHeader";
import { useKnowledgeBaseSelection } from "./useKnowledgeBaseSelection";

interface KnowledgeBaseHeaderProps {
  agentId: AgentId;
}

export function KnowledgeBaseHeader({ agentId }: KnowledgeBaseHeaderProps) {
  const { selectedDatabase, clearDatabase } = useKnowledgeBaseSelection(agentId);

  if (!selectedDatabase) {
    return (
      <div className="flex w-full items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">DATABASES</h2>
      </div>
    );
  }

  return (
    <DataHeader
      agentId={agentId}
      title={selectedDatabase.name}
      onBack={clearDatabase}
    />
  );
}
