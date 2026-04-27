"use client";

import { Ellipsis } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";

export interface ActionItem {
  label: string;
  icon?: React.ReactNode;
  destructive?: boolean;
  onClick?: () => void;
}

interface RowActionsProps {
  actions: ActionItem[];
}

export function RowActions({ actions }: RowActionsProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-sidebar-accent/50 rounded cursor-pointer"
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
        {actions.map((action, index) => (
          <DropdownMenuItem 
            key={index} 
            onClick={action.onClick}
            className={action.destructive ? "text-red-600 focus:text-red-600 focus:bg-red-50" : ""}
          >
            {action.icon && <span className="mr-2">{action.icon}</span>}
            {action.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
