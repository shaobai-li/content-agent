import { BadgeCheck, Bot, MessageSquare, Clock, Activity, Play, BarChart3, Timer } from "lucide-react";
import { Card, CardContent } from "@/shared/ui/card";

const agentInfo = {
  name: "CodePilot",
  description: "Strategic AI assistant specialized in code analysis, generation, and optimization across multiple programming languages.",
  status: "Active" as const,
  model: "GPT-4o",
  sessions: 128,
  lastActive: "2m ago",
  realtimeStatus: "Online",
  currentTask: "Data Analysis",
  executionContent: "Processing Q3 revenue reports and generating summary insights...",
  duration: "00:12:34",
  stats: [
    { label: "Today", value: "3h 42m" },
    { label: "Cumulative", value: "127h 15m" },
    { label: "Tokens", value: "1.2M" },
    { label: "Sessions", value: "456" },
  ],
};

const statusColor = agentInfo.status === "Active"
  ? "bg-emerald-500/10 text-emerald-600"
  : "bg-muted text-muted-foreground";

export function AgentInfoCard() {
  return (
    <Card className="gap-0 border-border bg-card py-5 text-card-foreground shadow-sm">
      <CardContent className="flex flex-col gap-4 px-5">
        {/* ── Zone 1: Name + Description + Status Badge ── */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <h3 className="text-base font-semibold text-foreground">{agentInfo.name}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{agentInfo.description}</p>
          </div>
          <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColor}`}>
            <BadgeCheck className="size-3" />
            {agentInfo.status}
          </span>
        </div>

        {/* ── Zone 2: Info Tags ── */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Bot className="size-3.5" />
            {agentInfo.model}
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <MessageSquare className="size-3.5" />
            {agentInfo.sessions}
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="size-3.5" />
            {agentInfo.lastActive}
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Activity className="size-3.5" />
            {agentInfo.realtimeStatus}
          </span>
        </div>

        {/* ── Zone 3: Task Status Panel ── */}
        <div className="rounded-lg border border-border bg-muted/40 p-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-foreground mb-2">
            <Play className="size-3" />
            Current Task
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-foreground">{agentInfo.currentTask}</span>
            <span className="text-xs text-muted-foreground">{agentInfo.executionContent}</span>
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
              <Timer className="size-3" />
              {agentInfo.duration}
            </span>
          </div>
        </div>

        {/* ── Zone 4: Stats Grid ── */}
        <div className="grid grid-cols-4 gap-4 border-t border-border pt-4">
          {agentInfo.stats.map((stat) => (
            <div key={stat.label} className="flex flex-col items-center gap-0.5">
              <span className="text-xs text-muted-foreground">{stat.label}</span>
              <span className="text-sm font-semibold text-foreground">{stat.value}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
