import { X } from "lucide-react";

export type MentionItem = {
  kind?: "database" | "folder" | "record";
  id: string;
  name: string;
  kbId?: string;
  nodeId?: string;
  recordId?: string;
  parsed_path?: string;
};

interface MentionChipProps {
  name: string;
  onRemove: () => void;
}

export function MentionChip({ name, onRemove }: MentionChipProps) {
  return (
    <div className="inline-flex items-center gap-2 px-3 py-2 bg-primary/10 text-primary rounded-md group">
      <span className="text-xs font-medium truncate max-w-[120px]" title={name}>
        {name}
      </span>
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground ml-0.5 opacity-60 group-hover:opacity-100 transition-opacity"
        onClick={onRemove}
        aria-label={`移除 ${name}`}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
