"use client";

import { ReactNode } from "react";
import { HistoryItemMenu } from "./HistoryItemMenu";
import { HistoryFooter } from "./HistoryFooter";

interface HistoryPanelProps {
  children?: ReactNode;
}

export function HistoryPanel({ children }: HistoryPanelProps) {
  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="flex flex-col flex-1">
      <div className="group relative flex items-start min-h-20 border-t border-neutral-200 px-3 py-4 bg-neutral-50 transition-colors hover:bg-muted">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-foreground">Creative Writing Project A</div>
          <div className="mt-1 text-xs text-muted-foreground">
            I&apos;ve been thinking about the core narrative arc for the protagonist. We need to establish the stakes early on...
          </div>
        </div>
        <HistoryItemMenu />
      </div>
      <div className="group relative flex items-start min-h-20 border-t border-neutral-200 px-3 py-4 bg-neutral-50 transition-colors hover:bg-muted">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-foreground">Marketing Campaign Copy Drafts</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Here are three versions of the headline for the winter product launch. Version 1 focuses on efficiency...
          </div>
        </div>
        <HistoryItemMenu />
      </div>
      <div className="group relative flex items-start min-h-20 border-t border-neutral-200 px-3 py-4 bg-neutral-50 transition-colors hover:bg-muted">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-foreground">Character Background: Elena Ross</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Elena&apos;s backstory should be deeply rooted in the technological landscape of Neo-Kyoto. She grew up in the shadow.
          </div>
        </div>
        <HistoryItemMenu />
      </div>
      {children}
      </div>
      <div className="flex flex-col p-4 border-t">
        <HistoryFooter />
      </div>
    </div>
  );
}
