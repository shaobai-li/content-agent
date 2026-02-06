"use client";

import { ReactNode } from "react";

interface DocumentPanelProps {
  agentId: string;
  children?: ReactNode;
}

export function DocumentPanel({ agentId, children }: DocumentPanelProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto p-4">
        <div className="text-sm text-muted-foreground mb-4">
          Document View for Agent: {agentId}
        </div>
        <div className="space-y-4">
          {/* 这里可以显示文档列表或文档内容 */}
          <div className="p-4 border rounded-lg bg-white">
            <p className="text-sm">文档查看器正在开发中...</p>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

