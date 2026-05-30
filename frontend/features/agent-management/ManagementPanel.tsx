"use client";

import { AgentInfoCard, type AgentInfoCardProps } from "./AgentInfoCard";

const mockCards: AgentInfoCardProps[] = [
  {
    name: "CodePilot",
    status: "Active",
    model: "GPT-4o",
    sessions: 128,
    lastActive: "2m ago",
    currentTask: "Data Analysis",
    duration: "00:12:34",
    stats: [
      { label: "Today", value: "3h 42m" },
      { label: "Tokens", value: "1.2M" },
      { label: "Pending", value: "—" },
    ],
  },
  {
    name: "System Health",
    status: "Active",
    model: "Monitor v2",
    sessions: 4,
    lastActive: "Just now",
    currentTask: "Resource Watch",
    duration: "48:22:10",
    stats: [
      { label: "Today", value: "12h 7m" },
      { label: "Tokens", value: "892K" },
      { label: "Pending", value: "—" },
    ],
  },
  {
    name: "Task Queue",
    status: "Idle",
    model: "Scheduler",
    sessions: 67,
    lastActive: "15m ago",
    currentTask: "Batch Export",
    duration: "01:08:22",
    stats: [
      { label: "Today", value: "2h 15m" },
      { label: "Tokens", value: "45K" },
      { label: "Pending", value: "3" },
    ],
  },
];

interface ManagementPanelProps {
  agentId: string;
}

export function ManagementPanel({ agentId }: ManagementPanelProps) {
  return (
    <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {mockCards.map((card) => (
          <AgentInfoCard key={card.name} {...card} />
        ))}
      </div>
    </div>
  );
}
