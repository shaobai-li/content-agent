import Image from "next/image";
import { DataTableColumn } from "@/components/features/data/DataTable";
import { PlatformIconMap } from "@/components/ui/icons";

export interface DataRecord {
  record_id: string;
  source_platform: string;
  author_name: string;
  videos: string[];
  images: string[];
}

export const AGENT_NM_COLUMNS: DataTableColumn<DataRecord>[] = [
  {
    key: "platform",
    label: "平台",
    width: "120px",
    render: (item) => {
      const platformIcon = PlatformIconMap[item.source_platform as keyof typeof PlatformIconMap];
      return (
        <div className="flex items-center gap-2">
          {platformIcon && (
            <Image
              src={platformIcon}
              alt={item.source_platform}
              title={item.source_platform}
              width={16}
              height={16}
              className="flex-shrink-0"
            />
          )}
          <span className="truncate">{item.source_platform}</span>
        </div>
      );
    }
  },
  {
    key: "author",
    label: "作者",
    width: "120px",
    render: (item) => <span className="truncate block">{item.author_name}</span>
  },
  {
    key: "images",
    label: "图片",
    width: "200px",
    className: "text-xs text-muted-foreground",
    render: (item) => 
      item.images.length > 0 ? (
        <span className="truncate block" title={item.images.join("\n")}>
          {item.images[0]}
        </span>
      ) : (
        <span className="text-muted-foreground">无</span>
      )
  },
  {
    key: "videos",
    label: "视频",
    className: "text-xs text-muted-foreground",
    render: (item) =>
      item.videos.length > 0 ? (
        <div className="space-y-1">
          {item.videos.map((path, i) => (
            <div key={i} className="truncate max-w-[200px]" title={path}>
              {path}
            </div>
          ))}
        </div>
      ) : (
        <span className="text-muted-foreground">无</span>
      )
  }
];

