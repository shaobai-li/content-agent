import { useState } from "react";
import {
  BadgeCheck,
  Bot,
  Ellipsis,
  EyeOff,
  MessageSquare,
  Settings,
  Timer,
  Trash2,
} from "lucide-react";
import { Card, CardContent } from "@/shared/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import { hideAgent, showAgent } from "@/entities/agent/visibility";
import { deleteAgent } from "@/shared/api/management";

export interface AgentInfoCardProps {
  agentId: string;
  name: string;
  locked?: boolean;
  visible: boolean;
  model: string;
  sessionCount: number;
  lastReplyTime: string | null;
  lastSessionTitle: string | null;
  onDeleted?: () => void;
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
  agentId,
  name,
  locked,
  visible,
  model,
  sessionCount,
  lastReplyTime,
  lastSessionTitle,
  onDeleted,
}: AgentInfoCardProps) {
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const statusLabel = visible ? "Active" : "Hidden";
  const statusStyle = visible
    ? "bg-emerald-500/10 text-emerald-600"
    : "bg-muted text-muted-foreground";

  const timeDisplay =
    lastReplyTime ? formatRelativeTime(lastReplyTime) : "暂无回复";
  const titleDisplay = lastSessionTitle ?? "暂无会话";

  const handleToggleVisibility = () => {
    if (visible) {
      hideAgent(agentId);
    } else {
      showAgent(agentId);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await deleteAgent(agentId);
      if (!res.ok) {
        setDeleteError(res.error ?? "删除失败");
        return;
      }
      setDeleteConfirm(false);
      onDeleted?.();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "删除失败，请稍后重试");
    } finally {
      setDeleting(false);
    }
  };

  // 仅 a_ 开头的自定义智能体且非锁定时可删除
  const canDelete = agentId.startsWith("a_") && !locked;

  return (
    <>
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

          {/* ── Zone 4: Token + Dropdown Menu ── */}
          <div className="inline-flex items-center justify-between border-t border-border pt-2 text-xs text-muted-foreground">
            <span>Token</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex size-6 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Ellipsis className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={4}>
                <DropdownMenuItem onClick={handleToggleVisibility}>
                  <span className="flex items-center gap-2 cursor-pointer">
                    <EyeOff className="size-4" />
                    {visible ? "Hide" : "Show"}
                  </span>
                </DropdownMenuItem>
                <div className="h-px bg-border mx-1 my-1" />
                <DropdownMenuItem onClick={() => {}}>
                  <span className="flex items-center gap-2 cursor-pointer">
                    <Settings className="size-4" />
                    Configure
                  </span>
                </DropdownMenuItem>
                {canDelete && (
                  <>
                    <div className="h-px bg-border mx-1 my-1" />
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => setDeleteConfirm(true)}
                    >
                      <span className="flex items-center gap-2 cursor-pointer">
                        <Trash2 className="size-4" />
                        删除
                      </span>
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={deleteConfirm} onOpenChange={(open) => { if (!open) setDeleteConfirm(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除「{name}」吗？删除后智能体将从列表中移除，相关数据不会被清除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <p className="text-sm text-destructive px-6">{deleteError}</p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleting}
              onClick={handleDelete}
            >
              {deleting ? "删除中..." : "删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
