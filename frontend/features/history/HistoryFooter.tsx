"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/shared/ui/button";

export function HistoryFooter() {
    return (
        <div className="flex items-center justify-center gap-2">
            <Button
                variant="ghost"
                size="sm"
                className="text-xs font-semibold text-neutral-500 hover:bg-transparent hover:text-foreground"
            >
                <ChevronLeftIcon className="size-4" />
                PREV
            </Button>
            <Button
                variant="ghost"
                size="sm"
                className="text-xs font-semibold text-neutral-500 hover:bg-transparent hover:text-foreground"
            >
                NEXT
                <ChevronRightIcon className="size-4" />
            </Button>
        </div>
    );
}
