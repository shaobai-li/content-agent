import { FileTypeIconMap } from "@/components/ui/icons";
import Image from "next/image";
import { X } from "lucide-react";

type FileType = keyof typeof FileTypeIconMap;

interface FileChipProps {
  fileName: string;
  fileType: FileType;
  onRemove?: () => void;
}

export function FileChip({ fileName, fileType, onRemove }: FileChipProps) {
  const Icon = FileTypeIconMap[fileType];

  return (
    <div className="inline-flex items-center gap-1 px-2 py-1 bg-muted rounded-md max-w-[200px] group">
      <Image src={Icon} alt={fileType} width={16} height={16} className="flex-shrink-0" />
      <span className="text-xs text-muted-foreground truncate" title={fileName}>
        {fileName}
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
