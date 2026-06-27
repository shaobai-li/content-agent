"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { useSessionList } from "@/entities/session/useSessionList";
import { usePagination } from "@/shared/lib/usePagination";
import { deleteSession } from "@/entities/session/api";
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
import { HistoryItem } from "./HistoryItem";
import { HistoryFooter } from "./HistoryFooter";

const PAGE_SIZE = 7;

export function HistoryPanel() {
  const params = useParams();
  const agentId = (params?.agentId as string) ?? null;
  const { sessions, loading, error, refreshSessions } = useSessionList(agentId);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const { currentItems, canGoPrev, canGoNext, goPrev, goNext } = usePagination(
    sessions,
    PAGE_SIZE,
  );

  // 监听对话保存事件，刷新历史列表
  useEffect(() => {
    const handler = () => refreshSessions();
    window.addEventListener("session-refresh", handler);
    return () => window.removeEventListener("session-refresh", handler);
  }, [refreshSessions]);

  // 监听来自 ChatPage 的新对话事件，取消高亮
  useEffect(() => {
    const handler = () => setActiveSessionId(null);
    window.addEventListener("session-new", handler);
    return () => window.removeEventListener("session-new", handler);
  }, []);

  const [deleteConfirm, setDeleteConfirm] = useState<{ sessionId: string; title: string } | null>(null);

  const handleSelect = useCallback((sessionId: string) => {
    setActiveSessionId(sessionId);
    window.dispatchEvent(new CustomEvent("session-select", { detail: { sessionId } }));
  }, []);

  const handleDelete = useCallback(
    (sessionId: string, title: string) => {
      setDeleteConfirm({ sessionId, title });
    },
    []
  );

  const handleDeleteConfirmed = useCallback(async () => {
    if (!deleteConfirm || !agentId) return;
    try {
      await deleteSession(agentId, deleteConfirm.sessionId);
      if (activeSessionId === deleteConfirm.sessionId) {
        setActiveSessionId(null);
        window.dispatchEvent(new CustomEvent("session-new"));
      }
      await refreshSessions();
    } catch (e) {
      console.error("删除失败:", e);
      toast.error("删除失败，请重试");
    }
    setDeleteConfirm(null);
  }, [deleteConfirm, agentId, activeSessionId, refreshSessions]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 flex-col overflow-auto">
        {loading ? (
          <div className="px-3 py-4 text-sm text-muted-foreground">
            加载中...
          </div>
        ) : error ? (
          <div className="px-3 py-4 text-sm text-destructive">{error}</div>
        ) : (
          currentItems.map((item) => (
            <HistoryItem
              key={item.session_id}
              id={item.session_id}
              title={item.title}
              preview={item.content ?? ""}
              active={item.session_id === activeSessionId}
              onClick={() => handleSelect(item.session_id)}
              onDelete={() => handleDelete(item.session_id, item.title)}
            />
          ))
        )}
      </div>
      <AlertDialog open={deleteConfirm !== null} onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除 "{deleteConfirm?.title ?? ""}" 吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDeleteConfirmed}>
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <div className="flex flex-col p-4 border-t">
        <HistoryFooter
          canGoPrev={canGoPrev}
          canGoNext={canGoNext}
          onPrev={goPrev}
          onNext={goNext}
        />
      </div>
    </div>
  );
}
