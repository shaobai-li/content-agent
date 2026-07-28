import { DocumentTextIcon, FolderIcon } from "@heroicons/react/24/solid";
import { AgentId } from "@/entities/agent/model";
import { fetchKbRecords, deleteKbRecord, moveKbRecord, renameKbRecord } from "@/shared/api/records";
import type { DataPanelConfig } from "./type";

function formatLocalDateTime(value: unknown) {
    if (typeof value !== "string" || !value) return "";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    const pad = (part: number) => String(part).padStart(2, "0");

    return [
        date.getFullYear(),
        pad(date.getMonth() + 1),
        pad(date.getDate()),
    ].join("-") + ` ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// 列标签翻译 key
const COLUMN_LABEL_KEYS: Record<string, string> = {
    name: "kb.columnName",
    file_ext: "kb.columnType",
    size_bytes: "kb.columnSize",
    created_at: "kb.columnDate",
};

// 运行时从 COLUMN_LABEL_KEYS 取翻译 key，DataTable 内通过 t() 解析为最终文本。
// 如果某个列需要覆盖显示文本（而非翻译 key），直接传入字符串即可。

export const createKnowledgeBasePanelConfig = (agentId: AgentId, databaseId: string): DataPanelConfig => ({
    fetchData: () => fetchKbRecords(agentId, databaseId),
    renameData: (nodeId: string, name: string) => renameKbRecord(agentId, nodeId, name, databaseId),
    moveData: (nodeId: string, parentId: string) => moveKbRecord(agentId, nodeId, parentId, databaseId),
    deleteData: (recordId: string) => deleteKbRecord(agentId, recordId, databaseId),
    rowKeyField: "id",
    dataKey: "nodes",
    emptyMessage: "kb.empty",
    refreshEvent: "kb-data-refresh",
    columnOrder: ["name", "file_ext", "size_bytes", "created_at"],
    columnLabels: COLUMN_LABEL_KEYS,
    columnMinWidths: {
        name: "120px",
        file_ext: "60px",
        size_bytes: "80px",
        created_at: "120px",
    },
    getDragData: (row) => {
        if (row.node_type === "folder" && typeof row.id === "string" && typeof row.name === "string") {
            return {
                kind: "folder",
                id: row.id,
                name: row.name,
                kbId: databaseId,
                nodeId: row.id,
            };
        }

        if (
            row.node_type === "record" &&
            typeof row.id === "string" &&
            typeof row.record_id === "string" &&
            typeof row.name === "string"
        ) {
            return {
                kind: "record",
                id: row.record_id,
                name: row.name,
                kbId: databaseId,
                nodeId: row.id,
                recordId: row.record_id,
                ...(typeof row.parsed_path === "string" ? { parsed_path: row.parsed_path } : {}),
            };
        }

        return null;
    },
    customRenderers: {
        name: (row) => {
            const depth = typeof row._depth === "number" ? row._depth : 0;
            const isFolder = row.node_type === "folder";
            const name = String(row.name || "");

            return (
                <div className="flex min-w-0 items-center gap-2" style={{ paddingLeft: `${depth * 20}px` }}>
                    {isFolder ? (
                        <FolderIcon className="size-4 flex-shrink-0 text-foreground" />
                    ) : (
                        <DocumentTextIcon className="size-4 flex-shrink-0 text-foreground" />
                    )}
                    <span className="min-w-0 flex-1 truncate" title={name}>
                        {name}
                    </span>
                </div>
            );
        },
        file_ext: (row) => {
            const text = row.node_type === "folder"
                ? "文件夹"
                : String(row.file_ext || row.type || "").toUpperCase() || "";
            return <span className="min-w-0 truncate block" title={text}>{text}</span>;
        },
        size_bytes: (row) => {
            if (row.node_type === "folder") return "";
            const n = row.size_bytes ?? row.size;
            let text;
            if (typeof n === "string") text = n;
            else if (typeof n !== "number") text = "";
            else if (n < 1024) text = `${n} B`;
            else if (n < 1024 * 1024) text = `${(n / 1024).toFixed(1)} KB`;
            else text = `${(n / (1024 * 1024)).toFixed(1)} MB`;
            return <span className="min-w-0 truncate block" title={text}>{text}</span>;
        },
        created_at: (row) => {
            const text = formatLocalDateTime(row.created_at || row.date_added || "");
            return <span className="min-w-0 truncate block" title={text}>{text}</span>;
        },
    },
});
