import { BadgeCheck, Bot, MessageSquare, Timer } from "lucide-react";
import { Card, CardContent } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";

export interface AgentInfoCardProps {
  name: string;
  visible: boolean;
  model: string;
  sessionCount: number;
  lastReplyTime: string | null;
  lastSessionTitle: string | null;
}

/** 格式化 ISO 时间为相对时间（"2m ago" / "3h ago" / "5d ago"） */
function formatRelativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  if (diffMs < 0) return "just now";

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function AgentInfoCard({
  name,
  visible,
  model,
  sessionCount,
  lastReplyTime,
  lastSessionTitle,
}: AgentInfoCardProps) {
  const statusLabel = visible ? "Active" : "Hidden";
  const statusStyle = visible
    ? "bg-emerald-500/10 text-emerald-600"
    : "bg-muted text-muted-foreground";

  const timeDisplay =
    lastReplyTime ? formatRelativeTime(lastReplyTime) : "暂无回复";
  const titleDisplay = lastSessionTitle ?? "暂无会话";

  return (
    <Card className="gap-0 border-border bg-card py-3 text-card-foreground shadow-sm">
      <CardContent className="flex flex-col gap-2 px-4">
        {/* ── Zone 1: Name + Status Badge ── */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">{name}</h3>
          <span
            className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${statusStyle}`}
          >
            <BadgeCheck className="size-3" />
            {statusLabel}
          </span>
        </div>

        {/* ── Zone 2: Model + Session Count ── */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Bot className="size-3.5" />
            {model}
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <MessageSquare className="size-3.5" />
            {sessionCount}
          </span>
        </div>

        {/* ── Zone 3: Last Reply Time · Last Session Title ── */}
        <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Timer className="size-3" />
          {timeDisplay}
          <span className="text-muted-foreground/40">·</span>
          {titleDisplay}
        </div>

        {/* ── Zone 4: Token + Config Button ── */}
        <div className="inline-flex items-center justify-between border-t border-border pt-2 text-xs text-muted-foreground">
          <span>
            <span className="font-medium text-foreground">1.2M</span>{" "}
            <span>总Token</span>
          </span>
          <Button variant="outline" size="sm" onClick={() => {}}>
            配置
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
