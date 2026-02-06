"use client";

import { Ellipsis, Pencil, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function HistoryItemMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="border-none px-2 py-2 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/5 rounded shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <Ellipsis className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem className="gap-2">
          <Pencil className="size-4" />
          Rename
        </DropdownMenuItem>
        <DropdownMenuItem className="gap-2 text-red-600 focus:bg-red-50 focus:text-red-600">
          <Trash2 className="size-4 text-red-600" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
