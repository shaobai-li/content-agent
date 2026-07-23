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

// 运行时从字典解析列标签（在 DataPanel/DataTable 的渲染上下文中，label 会通过 columnLabels 传给 DataTable，
// DataTable 用 columnLabels[key] 展示。这里用翻译 key 作为 label，组件内不额外处理，
// 但为了让列标签也支持 i18n，我们在 DataTable 中用 t() 解析 columnLabels 的值）
//
// 注意：当前 DataTable 直接将 columnLabels[key] 作为文本渲染，未做 i18n 转换。
// 因此这里保持原有中文硬编码，等待 DataTable 的 columnLabels 支持翻译 key 机制。

export const createKnowledgeBasePanelConfig = (agentId: AgentId, databaseId: string): DataPanelConfig => ({
    fetchData: () => fetchKbRecords(agentId, databaseId),
    renameData: (nodeId: string, name: string) => renameKbRecord(agentId, nodeId, name, databaseId),
    moveData: (nodeId: string, parentId: string) => moveKbRecord(agentId, nodeId, parentId, databaseId),
    deleteData: (recordId: string) => deleteKbRecord(agentId, recordId, databaseId),
    rowKeyField: "id",
    dataKey: "nodes",
    emptyMessage: "No knowledge found",
    refreshEvent: "kb-data-refresh",
    columnOrder: ["name", "file_ext", "size_bytes", "created_at"],
    columnLabels: {
        name: "文件名",
        file_ext: "类型",
        size_bytes: "大小",
        created_at: "添加时间",
    },
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
