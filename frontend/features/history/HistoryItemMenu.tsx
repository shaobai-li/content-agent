"use client";

import { Ellipsis, Pencil, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { useTranslation } from "react-i18next";

interface HistoryItemMenuProps {
  onRename?: () => void;
  onDelete?: () => void;
}

export function HistoryItemMenu({ onRename, onDelete }: HistoryItemMenuProps) {
  const { t } = useTranslation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="border-none px-2 py-2 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/5 rounded shrink-0"
          onClick={(e) => e.stopPropagation()}
          onDragStart={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <Ellipsis className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          className="gap-2"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRename?.();
          }}
        >
          <Pencil className="size-4" />
          {t("data.rename")}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-2 text-red-600 focus:bg-red-50 focus:text-red-600"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete?.();
          }}
        >
          <Trash2 className="size-4 text-red-600" />
          {t("data.delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
