"use client";

import { ReactNode } from "react";

interface HistoryPanelProps {
  children?: ReactNode;
}

export function HistoryPanel({ children }: HistoryPanelProps) {
  return (
    <div className="overflow-auto rounded-lg bg-white shadow-sm">
      {children}
    </div>
  );
}
