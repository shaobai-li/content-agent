"use client";

import { useState } from "react";
import { Plus, RotateCw, RefreshCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/shared/ui/dialog";
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
import { Card, CardContent } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Switch } from "@/shared/ui/switch";
import { cn } from "@/shared/lib/cn";

// ── Types ────────────────────────────────────────────────────────

interface McpServerConfig {
  id: string;
  name: string;
  transport: "stdio" | "sse";
  command?: string;
  args?: string;
  url?: string;
  enabled: boolean;
  tools?: string[];
}

// ── Fake data ─────────────────────────────────────────────────────

const FAKE_SERVERS: McpServerConfig[] = [
  {
    id: "1",
    name: "hermes-studio-api",
    transport: "stdio",
    command: "npx",
    args: "hermes-studio-api",
    enabled: true,
    tools: ["hermes_studio_api_openapi_get", "hermes_studio_api_request"],
  },
  {
    id: "2",
    name: "memory-server",
    transport: "sse",
    url: "http://localhost:3001/sse",
    enabled: false,
    tools: [
      "memory_read", "memory_write", "memory_search", "memory_delete",
      "memory_list", "memory_export", "memory_import", "memory_backup",
      "memory_restore", "memory_cleanup", "memory_optimize",
      "memory_tag_add", "memory_tag_remove", "memory_tag_list",
      "memory_query", "memory_batch_read", "memory_batch_write",
      "memory_snapshot", "memory_diff", "memory_merge",
      "memory_lock", "memory_unlock", "memory_history",
      "memory_rollback", "memory_audit",
    ],
  },
  {
    id: "3",
    name: "file-server",
    transport: "stdio",
    command: "npx",
    args: "@anthropic/file-server",
    enabled: true,
    tools: ["file_read", "file_write", "file_delete", "file_list", "file_search", "file_stat"],
  },
  {
    id: "4",
    name: "database-connector",
    transport: "sse",
    url: "http://localhost:3002/sse",
    enabled: true,
    tools: ["db_query", "db_execute", "db_list_tables", "db_describe_table"],
  },
  {
    id: "5",
    name: "search-engine",
    transport: "sse",
    url: "http://localhost:3003/sse",
    enabled: false,
    tools: ["web_search", "web_fetch", "news_search", "image_search", "video_search"],
  },
  {
    id: "6",
    name: "code-analyzer",
    transport: "stdio",
    command: "npx",
    args: "code-analyzer",
    enabled: true,
    tools: [
      "code_lint", "code_format", "code_complexity", "code_coverage",
      "code_duplication", "code_security_scan", "code_dependency_check",
    ],
  },
  {
    id: "7",
    name: "git-integration",
    transport: "stdio",
    command: "npx",
    args: "@anthropic/git-mcp",
    enabled: true,
    tools: ["git_status", "git_diff", "git_log", "git_commit", "git_branch", "git_merge"],
  },
  {
    id: "8",
    name: "slack-bot",
    transport: "sse",
    url: "http://localhost:3004/sse",
    enabled: false,
    tools: ["slack_send_message", "slack_list_channels", "slack_read_messages"],
  },
  {
    id: "9",
    name: "docker-manager",
    transport: "stdio",
    command: "docker",
    args: "run --rm mcp/docker",
    enabled: true,
    tools: [
      "docker_ps", "docker_images", "docker_pull", "docker_run",
      "docker_stop", "docker_logs", "docker_exec", "docker_compose_up",
      "docker_compose_down", "docker_network_list", "docker_volume_list",
    ],
  },
];

// ── Component ─────────────────────────────────────────────────────

interface McpServersPanelProps {
  agentId: string;
}

export function McpServersPanel({ agentId: _agentId }: McpServersPanelProps) {
  const [servers, setServers] = useState<McpServerConfig[]>(FAKE_SERVERS);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [jsonInput, setJsonInput] = useState("");

  // Delete confirm state
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // ── Dialog handlers ─────────────────────────────────────────────

  const openAddDialog = () => {
    setEditingId(null);
    setJsonInput("");
    setDialogOpen(true);
  };

  const openEditDialog = (server: McpServerConfig) => {
    setEditingId(server.id);
    setJsonInput(JSON.stringify(server, null, 2));
    setDialogOpen(true);
  };

  const handleSave = () => {
    try {
      const parsed: McpServerConfig = JSON.parse(jsonInput);
      if (!parsed.name?.trim()) return;

      if (editingId) {
        setServers((prev) =>
          prev.map((s) => (s.id === editingId ? { ...parsed, id: editingId } : s)),
        );
      } else {
        setServers((prev) => [...prev, { ...parsed, id: String(Date.now()) }]);
      }
      setDialogOpen(false);
    } catch {
      // JSON 解析失败时不关闭 Dialog
    }
  };

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-5">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-foreground">MCP 服务器</h3>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          title="刷新"
        >
          <RotateCw className="size-3.5" />
          刷新
        </button>
      </div>

      {/* 衬线 */}
      <div className="w-full border-t border-border" />

      {/* ── Toolbar ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <Input
          placeholder="搜索服务器..."
          className="max-w-60 h-9 text-sm"
          readOnly
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <RefreshCw className="size-3.5" />
            全部重载
          </button>
          <button
            type="button"
            onClick={openAddDialog}
            className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-sm text-background hover:opacity-90 transition-opacity cursor-pointer"
          >
            <Plus className="size-3.5" />
            添加服务器
          </button>
        </div>
      </div>

      {/* ── Server Card Grid ────────────────────────────────────── */}
      {servers.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          暂无 MCP 服务器，点击上方"添加服务器"开始配置
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {servers.map((server) => (
            <ServerCard
              key={server.id}
              server={server}
              onEdit={() => openEditDialog(server)}
              onDelete={() => setDeleteConfirm(server.id)}
              onToggle={(enabled) =>
                setServers((prev) =>
                  prev.map((s) => (s.id === server.id ? { ...s, enabled } : s)),
                )
              }
            />
          ))}
        </div>
      )}

      {/* ── Add / Edit Dialog ────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "编辑 MCP 服务器" : "添加 MCP 服务器"}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <textarea
                placeholder='在此粘贴 JSON 配置…'
                value={jsonInput}
                onChange={(e) => setJsonInput(e.target.value)}
                className={cn(
                  "selection:bg-primary selection:text-primary-foreground border-input w-full min-w-0 rounded-md border bg-muted px-3 py-2 text-sm text-foreground shadow-xs transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 resize-y",
                  "focus-visible:border-input focus-visible:ring-0 focus-visible:ring-offset-0",
                )}
                rows={12}
                autoComplete="off"
              />
            </div>
          </div>

          <DialogFooter>
            <button
              type="button"
              onClick={() => setDialogOpen(false)}
              className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="rounded-md bg-foreground px-4 py-2 text-sm text-background hover:opacity-90 transition-opacity cursor-pointer"
            >
              保存
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ──────────────────────────────────────── */}
      <AlertDialog
        open={deleteConfirm !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除 MCP 服务器「
              {servers.find((s) => s.id === deleteConfirm)?.name ?? ""}
              」吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setServers((prev) => prev.filter((s) => s.id !== deleteConfirm));
                setDeleteConfirm(null);
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────

function ServerCard({
  server,
  onEdit,
  onDelete,
  onToggle,
}: {
  server: McpServerConfig;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: (enabled: boolean) => void;
}) {
  const transportLabel = server.transport === "stdio" ? "stdio" : "sse";
  const isConnected = server.enabled;

  return (
    <Card className="flex flex-col h-55 gap-0 border-border bg-card py-4 text-card-foreground shadow-sm">
      {/* Top: name + badges */}
      <CardContent className="flex shrink-0 items-start justify-between px-4 pb-0">
        <span className="text-base font-semibold text-foreground">{server.name}</span>
        <div className="flex shrink-0 items-center gap-2">
          {/* Transport badge */}
          <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
            {transportLabel}
          </span>
          {/* Status badge */}
          <span
            className={cn(
              "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
              isConnected
                ? "bg-green-500/10 text-green-600 dark:text-green-400"
                : "bg-gray-500/10 text-muted-foreground",
            )}
          >
            {isConnected ? "已连接" : "未连接"}
          </span>
        </div>
      </CardContent>

      {/* Tools list */}
      {server.tools && server.tools.length > 0 && (
        <CardContent className="flex min-h-0 flex-1 flex-col gap-2 px-4 pt-4 pb-0">
          <div className="flex shrink-0 items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">工具列表</span>
            <span className="text-xs text-muted-foreground/70">
              {server.tools.length}/{server.tools.length}个工具
            </span>
          </div>
          <div className="flex min-h-0 flex-1 flex-wrap gap-1.5 overflow-y-auto content-start">
            {server.tools.map((tool) => (
              <span
                key={tool}
                className="inline-flex items-center rounded-md bg-accent/50 px-2 py-0.5 text-xs font-mono text-accent-foreground shrink-0"
              >
                {tool}
              </span>
            ))}
          </div>
        </CardContent>
      )}

      {/* Bottom: actions */}
      <CardContent className="flex shrink-0 flex-col gap-0 px-4 pb-0">
        <div className="w-full border-t border-border" />
        <div className="flex items-center gap-4 pt-3">
          <ActionButton onClick={onEdit}>编辑</ActionButton>
          <ActionButton variant="destructive" onClick={onDelete}>
            移除
          </ActionButton>
          <div className="ml-auto flex items-center">
            <Switch
              checked={server.enabled}
              onCheckedChange={onToggle}
              aria-label={`${server.enabled ? "禁用" : "启用"} ${server.name}`}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ActionButton({
  children,
  variant,
  onClick,
}: {
  children: React.ReactNode;
  variant?: "default" | "destructive";
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-sm transition-colors cursor-pointer",
        variant === "destructive"
          ? "text-destructive hover:text-destructive/80"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
