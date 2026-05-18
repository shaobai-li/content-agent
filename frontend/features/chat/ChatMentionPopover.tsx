"use client";

import { useState, useEffect } from "react";
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
import { fetchKbRecords } from "@/shared/api/records";
import type { MentionItem } from "./MentionChip";
import { AgentId } from "@/entities/agent/model";

interface ChatMentionPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (item: MentionItem) => void;
  children: React.ReactNode;
  agentId: AgentId;
}

type KnowledgeBaseRecordOption = {
  id?: string;
  record_id?: string;
  name?: string;
  parsed_path?: string;
};

export function ChatMentionPopover({
  open,
  onOpenChange,
  onSelect,
  children,
  agentId,
}: ChatMentionPopoverProps) {
  const [mentionOptions, setMentionOptions] = useState<MentionItem[]>([]);

  useEffect(() => {
    if (open) {
      fetchKbRecords(agentId)
        .then((response) => {
          const nodes = response.nodes || [];
          const options = (nodes as KnowledgeBaseRecordOption[]).map((record) => ({
            id: record.record_id ?? "",
            name: record.name ?? "",
            kind: "record" as const,
            recordId: record.record_id,
            ...(record.id ? { nodeId: record.id } : {}),
            parsed_path: record.parsed_path,
          }));
          setMentionOptions(options);
        })
        .catch((err) => {
          console.error("Failed to fetch knowledge base records:", err);
          setMentionOptions([]);
        });
    }
  }, [open, agentId]);

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
        className="w-[calc(var(--radix-popover-trigger-width)/1.5)] p-0"
      >
        <Command shouldFilter={false}>
          <CommandList>
            <CommandGroup>
              {mentionOptions.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  No articles available
                </div>
              ) : (
                mentionOptions.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={item.name}
                    onSelect={() => handleSelect(item)}
                    className="gap-2"
                  >
                    <BookOpen className="size-4 text-muted-foreground flex-shrink-0" />
                    <span className="truncate" title={item.name}>
                      {item.name}
                    </span>
                  </CommandItem>
                ))
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
