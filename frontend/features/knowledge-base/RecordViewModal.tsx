"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { fetchKbRecordContent } from "@/shared/api/records";
import type { RecordContentResponse } from "@/shared/api/records";

interface RecordViewModalProps {
  agentId: string;
  kbId: string;
  recordId: string;
  fileName: string;
  onClose: () => void;
}

export function RecordViewModal({
  agentId,
  kbId,
  recordId,
  fileName,
  onClose,
}: RecordViewModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<RecordContentResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);

    fetchKbRecordContent(agentId, kbId, recordId)
      .then((res) => {
        if (!cancelled) {
          setData(res);
          setLoading(false);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message || "无法加载文件内容");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [agentId, kbId, recordId]);

  const isMarkdown =
    data?.content_type === "parsed" ||
    fileName.endsWith(".md") ||
    fileName.endsWith(".txt");

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="truncate pr-6">{fileName}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6">
          <div className="min-h-0 py-2">
            {loading && (
              <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
                加载中...
              </div>
            )}

            {error && (
              <div className="flex items-center justify-center py-12 text-destructive text-sm">
                {error}
              </div>
            )}

            {!loading && !error && data && !data.content.trim() && (
              <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
                (空文件)
              </div>
            )}

            {!loading && !error && data && data.content.trim() && (
              <div className="prose prose-sm dark:prose-invert max-w-none break-words">
                {isMarkdown ? (
                  <ReactMarkdown>{data.content}</ReactMarkdown>
                ) : (
                  <pre className="whitespace-pre-wrap font-mono text-sm">
                    {data.content}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
