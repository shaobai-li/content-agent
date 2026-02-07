"use client";

import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { HistoryItemMenu } from "./HistoryItemMenu";

export interface HistoryItemProps {
  title: string;
  preview: string;
  id?: string;
  onClick?: () => void;
}

export function HistoryItem({ title, preview, id, onClick }: HistoryItemProps) {
  return (
    <Card
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className="group relative min-h-20 rounded-none border-0 border-b border-neutral-200 px-3 py-4 shadow-none transition-colors hover:bg-muted bg-neutral-50 gap-0 cursor-default"
    >
      <CardHeader className="px-0 py-0 gap-1 has-data-[slot=card-action]:grid-cols-[1fr_auto]">
        <CardTitle className="text-sm font-semibold text-foreground min-w-0">
          {title}
        </CardTitle>
        <CardDescription className="text-xs mt-0 line-clamp-2 min-w-0">
          {preview}
        </CardDescription>
        <CardAction>
          <HistoryItemMenu />
        </CardAction>
      </CardHeader>
    </Card>
  );
}
