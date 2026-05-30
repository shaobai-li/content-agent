"use client";

interface ManagementPanelProps {
  agentId: string;
}

export function ManagementPanel({ agentId }: ManagementPanelProps) {
  return (
    <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col gap-6">
      <h3 className="text-base font-semibold text-foreground">AGENT MANAGEMENT</h3>
      {/* 后续内容在此扩展 */}
    </div>
  );
}
