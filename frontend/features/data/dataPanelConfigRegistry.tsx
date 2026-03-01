import Image from "next/image";
import { AgentId } from "@/entities/agent/model";
import { PlatformIconMap, FileTypeIconMap } from "@/shared/ui/icons";
import { fetchNmRecords, fetchKbRecords } from "@/shared/api/records";
import type { DataPanelConfig } from "./type";

export const dataPanelConfigRegistry: Partial<Record<AgentId, DataPanelConfig>> = {
    nm: {
        fetchData: fetchNmRecords,
        rowKeyField: "record_id",
        dataKey: "records",
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
        rowKeyField: "record_id",
        dataKey: "records",
        emptyMessage: "No knowledge base data available",
        refreshEvent: "kb-data-refresh",
        columnOrder: ["name", "type", "size", "date_added"],
        columnLabels: {
            name: "文件名",
            type: "类型",
            size: "大小",
            date_added: "添加日期",
        },
        columnWidths: {
            type: "100px",
            size: "120px",
            date_added: "140px",
        },
        customRenderers: {
            name: (row) => {
                const icon = FileTypeIconMap[row.type as keyof typeof FileTypeIconMap];
                return (
                    <div className="flex items-center gap-2">
                        {icon && (
                            <Image
                                src={icon}
                                alt={row.type}
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
            type: (row) => row.type?.toUpperCase() || "",
        },
    },
};
