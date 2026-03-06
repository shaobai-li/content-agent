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
    <div className="inline-flex items-center gap-2 px-3 py-2 bg-primary/10 text-primary rounded-md group">
      <span className="text-xs font-medium truncate max-w-[120px]" title={label}>
        {label}
      </span>
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground ml-0.5 opacity-60 group-hover:opacity-100 transition-opacity"
        onClick={onRemove}
        aria-label={`移除 ${label}`}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
