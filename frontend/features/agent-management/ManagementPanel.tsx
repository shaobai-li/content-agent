"use client";

import { Card, CardContent } from "@/shared/ui/card";

const placeholderCards = [
  { title: "Cluster Management", description: "View and manage agent cluster nodes, resource allocation and health status" },
  { title: "Analytics Dashboard", description: "Monitor agent usage metrics, performance trends and system analytics" },
  { title: "Access Control", description: "Configure agent permissions, role assignments and security policies" },
];

interface ManagementPanelProps {
  agentId: string;
}

export function ManagementPanel({ agentId }: ManagementPanelProps) {
  return (
    <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {placeholderCards.map((card) => (
          <Card
            key={card.title}
            className="relative min-h-36 gap-0 border-border bg-card py-6 text-card-foreground shadow-sm"
          >
            <CardContent className="flex flex-col gap-2 pb-10 pr-14 pt-0">
              <span className="text-sm font-medium text-foreground">{card.title}</span>
              <p className="text-sm text-muted-foreground">{card.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
