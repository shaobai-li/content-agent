import { BadgeCheck, Bot, MessageSquare, Clock, Timer } from "lucide-react";
import { Card, CardContent } from "@/shared/ui/card";

export interface AgentStatItem {
  label: string;
  value: string;
}

export interface AgentInfoCardProps {
  name: string;
  status: "Active" | "Idle";
  model: string;
  sessions: number;
  lastActive: string;
  currentTask: string;
  duration: string;
  stats: AgentStatItem[];
}

const statusStyles: Record<"Active" | "Idle", string> = {
  Active: "bg-emerald-500/10 text-emerald-600",
  Idle: "bg-muted text-muted-foreground",
};

export function AgentInfoCard({
  name,
  status,
  model,
  sessions,
  lastActive,
  currentTask,
  duration,
  stats,
}: AgentInfoCardProps) {
  return (
    <Card className="gap-0 border-border bg-card py-3 text-card-foreground shadow-sm">
      <CardContent className="flex flex-col gap-2 px-4">
        {/* ── Zone 1: Name + Status Badge ── */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">{name}</h3>
          <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${statusStyles[status]}`}>
            <BadgeCheck className="size-3" />
            {status}
          </span>
        </div>

        {/* ── Zone 2: Info Tags ── */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Bot className="size-3.5" />
            {model}
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <MessageSquare className="size-3.5" />
            {sessions}
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="size-3.5" />
            {lastActive}
          </span>
        </div>

        {/* ── Zone 3: Current Task (inline) ── */}
        <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Timer className="size-3" />
          {duration}
          <span className="text-muted-foreground/40">·</span>
          {currentTask}
        </div>

        {/* ── Zone 4: Stats (inline) ── */}
        <div className="inline-flex flex-wrap items-center gap-1 text-xs text-muted-foreground border-t border-border pt-2">
          {stats.map((stat, i) => (
            <span key={stat.label}>
              {i > 0 && <span className="mx-1.5 text-muted-foreground/30">·</span>}
              <span className="text-foreground font-medium">{stat.value}</span>
              <span className="ml-0.5">{stat.label}</span>
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
