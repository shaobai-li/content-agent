import Image from "next/image";
import { AgentId } from "@/entities/agent/model";
import { PlatformIconMap, FileTypeIconMap } from "@/shared/ui/icons";
import { fetchNmRecords, fetchKbRecords, deleteKbRecord } from "@/shared/api/records";
import type { DataPanelConfig } from "./type";

export const dataPanelConfigRegistry: Partial<Record<AgentId, DataPanelConfig>> = {
    nm: {
        fetchData: fetchNmRecords,
        rowKeyField: "record_id",
        dataKey: "nodes",
        emptyMessage: "暂无笔记数据",
        columnOrder: ["source_platform", "author_name", "images", "videos"],
        columnLabels: {
            source_platform: "平台",
            author_name: "作者",
            images: "图片",
            videos: "视频",
        },
        columnWidths: {
            source_platform: "120px",
            author_name: "120px",
            images: "200px",
        },
        customRenderers: {
            source_platform: (row) => {
                const icon = PlatformIconMap[row.source_platform as keyof typeof PlatformIconMap];
                return (
                    <div className="flex items-center gap-2">
                        {icon && (
                            <Image
                                src={icon}
                                alt={row.source_platform}
                                width={16}
                                height={16}
                                className="flex-shrink-0"
                            />
                        )}
                        <span className="truncate">{row.source_platform}</span>
                    </div>
                );
            },
            author_name: (row) => (
                <span className="truncate block">{row.author_name}</span>
            ),
            images: (row) =>
                row.images?.length > 0 ? (
                    <span className="truncate block" title={row.images.join("\n")}>
                        {row.images[0]}
                    </span>
                ) : (
                    <span className="text-muted-foreground">无</span>
                ),
            videos: (row) =>
                row.videos?.length > 0 ? (
                    <div className="space-y-1">
                        {row.videos.map((path: string, i: number) => (
                            <div key={i} className="truncate max-w-[200px]" title={path}>
                                {path}
                            </div>
                        ))}
                    </div>
                ) : (
                    <span className="text-muted-foreground">无</span>
                ),
        },
    },
    kb: {
        fetchData: fetchKbRecords,
        deleteData: deleteKbRecord,
        rowKeyField: "record_id",
        dataKey: "nodes",
        emptyMessage: "No knowledge base data available",
        refreshEvent: "kb-data-refresh",
        columnOrder: ["name", "file_ext", "size_bytes", "created_at"],
        columnLabels: {
            name: "文件名",
            file_ext: "类型",
            size_bytes: "大小",
            created_at: "添加日期",
        },
        columnWidths: {
            file_ext: "100px",
            size_bytes: "120px",
            created_at: "140px",
        },
        customRenderers: {
            name: (row) => {
                const ext = (row.file_ext || row.type || "") as keyof typeof FileTypeIconMap;
                const icon = FileTypeIconMap[ext];
                return (
                    <div className="flex items-center gap-2">
                        {icon && (
                            <Image
                                src={icon}
                                alt={String(ext)}
                                width={16}
                                height={16}
                                className="flex-shrink-0"
                            />
                        )}
                        <span className="truncate" title={row.name}>
                            {row.name}
                        </span>
                    </div>
                );
            },
            file_ext: (row) => String(row.file_ext || row.type || "").toUpperCase() || "",
            size_bytes: (row) => {
                const n = row.size_bytes ?? row.size;
                if (typeof n === "string") return n;
                if (typeof n !== "number") return "";
                if (n < 1024) return `${n} B`;
                if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
                return `${(n / (1024 * 1024)).toFixed(1)} MB`;
            },
            created_at: (row) => String(row.created_at || row.date_added || ""),
        },
    },
};
