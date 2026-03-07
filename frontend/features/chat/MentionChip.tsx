import { X } from "lucide-react";

export type MentionItem = {
  id: string;
  label: string;
  parsed_path?: string;
};

interface MentionChipProps {
  id: string;
  label: string;
  onRemove: () => void;
}

export function MentionChip({ id, label, onRemove }: MentionChipProps) {
  return (
    <div className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded text-[11px] group">
      <span className="font-medium truncate max-w-[80px]" title={label}>
        {label}
      </span>
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground opacity-60 group-hover:opacity-100 transition-opacity shrink-0"
        onClick={onRemove}
        aria-label={`移除 ${label}`}
      >
        <X className="w-2.5 h-2.5" />
      </button>
    </div>
  );
}
