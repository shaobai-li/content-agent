import { FileTypeIconMap } from "@/components/ui/icons";
import Image from "next/image";

type FileType = keyof typeof FileTypeIconMap;

interface FileChipProps {
  fileName: string;
  fileType: FileType;
  onRemove?: () => void;
}

export function FileChip({ fileName, fileType, onRemove }: FileChipProps) {
  const Icon = FileTypeIconMap[fileType];

  return (
    <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-slate-100 rounded-md max-w-[200px] group">
      <Image src={Icon} alt={fileType} width={16} height={16} className="flex-shrink-0" />
      <span className="text-sm text-slate-700 truncate" title={fileName}>
        {fileName}
      </span>
      <button
        type="button"
        className="text-slate-400 hover:text-slate-600 ml-0.5 opacity-60 group-hover:opacity-100 transition-opacity"
        onClick={onRemove}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
