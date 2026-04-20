"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/shared/ui/button";

interface HistoryFooterProps {
  canGoPrev?: boolean;
  canGoNext?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
}

export function HistoryFooter({
  canGoPrev = false,
  canGoNext = false,
  onPrev,
  onNext,
}: HistoryFooterProps) {
  return (
    <div className="flex items-center justify-center gap-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={!canGoPrev}
        onClick={onPrev}
        className="text-xs font-semibold text-neutral-500 hover:bg-transparent hover:text-foreground"
      >
        <ChevronLeftIcon className="size-4" />
        PREV
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={!canGoNext}
        onClick={onNext}
        className="text-xs font-semibold text-neutral-500 hover:bg-transparent hover:text-foreground"
      >
        NEXT
        <ChevronRightIcon className="size-4" />
      </Button>
    </div>
  );
}
