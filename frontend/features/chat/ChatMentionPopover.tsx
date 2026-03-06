"use client";

import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/shared/ui/popover";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/shared/ui/command";
import { BookOpen } from "lucide-react";
import type { MentionItem } from "./MentionChip";

interface ChatMentionPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (item: MentionItem) => void;
  children: React.ReactNode;
}

const MENTION_OPTIONS: MentionItem[] = [
  { id: "kb-1", label: "知识库" },
];

export function ChatMentionPopover({
  open,
  onOpenChange,
  onSelect,
  children,
}: ChatMentionPopoverProps) {
  const handleSelect = (item: MentionItem) => {
    onSelect(item);
    onOpenChange(false);
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>{children}</PopoverAnchor>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        className="w-[calc(var(--radix-popover-trigger-width)/3)] p-0"
      >
        <Command shouldFilter={false}>
          <CommandList>
            <CommandGroup>
              {MENTION_OPTIONS.map((item) => (
                <CommandItem
                  key={item.id}
                  value={item.label}
                  onSelect={() => handleSelect(item)}
                  className="gap-2"
                >
                  <BookOpen className="size-4 text-muted-foreground" />
                  {item.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
