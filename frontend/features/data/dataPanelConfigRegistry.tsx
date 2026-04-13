import { DocumentTextIcon, FolderIcon } from "@heroicons/react/24/solid";
import { AgentId } from "@/entities/agent/model";
import { fetchKbRecords, deleteKbRecord } from "@/shared/api/records";
import type { DataPanelConfig } from "./type";

export const dataPanelConfigRegistry: Partial<Record<AgentId, DataPanelConfig>> = {
    kb: {
        fetchData: fetchKbRecords,
        deleteData: deleteKbRecord,
        rowKeyField: "id",
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
                const depth = typeof row._depth === "number" ? row._depth : 0;
                const isFolder = row.node_type === "folder";
                return (
                    <div className="flex items-center gap-2" style={{ paddingLeft: `${depth * 20}px` }}>
                        {isFolder ? (
                            <FolderIcon className="size-4 flex-shrink-0 text-foreground" />
                        ) : (
                            <DocumentTextIcon className="size-4 flex-shrink-0 text-foreground" />
                        )}
                        <span className="truncate" title={row.name}>
                            {row.name}
                        </span>
                    </div>
                );
            },
            file_ext: (row) =>
                row.node_type === "folder"
                    ? "文件夹"
                    : String(row.file_ext || row.type || "").toUpperCase() || "",
            size_bytes: (row) => {
                if (row.node_type === "folder") return "";
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
