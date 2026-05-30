"use client";

import { AgentInfoCard } from "./AgentInfoCard";

interface ManagementPanelProps {
  agentId: string;
}

export function ManagementPanel({ agentId }: ManagementPanelProps) {
  return (
    <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col gap-6">
      <AgentInfoCard />
    </div>
  );
}
