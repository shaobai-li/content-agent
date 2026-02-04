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
              className="w-4 h-4 object-contain"
            />
          )}
          <span>{item.source_platform}</span>
        </div>
      );
    }
  },
  {
    key: "author",
    label: "作者",
    width: "100px",
    render: (item) => (
      <span className="font-medium">{item.author_name}</span>
    )
  },
  {
    key: "images",
    label: "图片",
    render: (item) => (
      <div className="text-sm text-gray-600">
        {item.images.length > 0 ? (
          <div className="truncate max-w-[200px]" title={item.images.join("\n")}>
            {item.images[0]}
          </div>
        ) : (
          <span className="text-gray-400">无</span>
        )}
      </div>
    )
  },
  {
    key: "videos",
    label: "视频",
    render: (item) => (
      <div className="text-sm text-gray-600">
        {item.videos.length > 0 ? (
          <ul className="list-none space-y-1">
            {item.videos.map((path, i) => (
              <li key={i} className="truncate max-w-[200px]" title={path}>
                {path}
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-gray-400">无</span>
        )}
      </div>
    )
  }
];

