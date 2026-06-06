import { FileTypeIconMap } from "@/shared/ui/icons";
import { X } from "lucide-react";

type FileType = keyof typeof FileTypeIconMap;

interface FileChipProps {
  fileName: string;
  fileType: FileType;
  cacheStatus?: "uploading" | "ready" | "error";
  cacheError?: string;
  onRemove?: () => void;
}

export function FileChip({
  fileName,
  fileType,
  cacheStatus,
  cacheError,
  onRemove,
}: FileChipProps) {
  const Icon = FileTypeIconMap[fileType];
  const statusHint =
    cacheStatus === "uploading"
      ? "上传中…"
      : cacheStatus === "error"
        ? cacheError || "上传失败"
        : cacheStatus === "ready"
          ? "已保存"
          : undefined;

  return (
    <div className="inline-flex items-center gap-1 px-2 py-1 bg-muted rounded-md max-w-[240px] group">
      <img src={Icon} alt={fileType} width={16} height={16} className="flex-shrink-0" />
      <span
        className="text-xs text-muted-foreground truncate min-w-0"
        title={statusHint ? `${fileName} — ${statusHint}` : fileName}
      >
        {fileName}
        {statusHint ? (
          <span className="text-[10px] text-muted-foreground/80 ml-1">({statusHint})</span>
        ) : null}
      </span>
      <button
        type="button"
        className="text-slate-400 hover:text-slate-600 ml-0.5 opacity-60 group-hover:opacity-100 transition-opacity"
        onClick={onRemove}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
