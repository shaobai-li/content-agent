import { Agent } from "./model";
import { AGENT_NM_COLUMNS } from "@/app/agent_nm/components/columns";
import { AGENT_KB_COLUMNS } from "@/app/agent_kb/components/columns";

export const agentRegistry: Record<Agent['id'], Agent> = {
    nm: {
        id: "nm",
        name: "笔记管理Agent",
        layout: {
            left: ["history", "knowledgebase"],
            defaultLeft: "knowledgebase",
            right: ["chat"],
            defaultRight: "chat",
        },
        dataPanelConfig: {
            columns: AGENT_NM_COLUMNS,
            apiEndpoint: "http://localhost:8000/api/nm/records",
            getRowKey: (item: any) => item.record_id,
            dataKey: "records",
            emptyMessage: "暂无笔记数据",
        },
    },
    kb: {
        id: "kb",
        name: "知识库Agent",
        layout: {
            left: ["history", "knowledgebase"],
            defaultLeft: "knowledgebase",
            right: ["chat"],
            defaultRight: "chat",
        },
        dataPanelConfig: {
            columns: AGENT_KB_COLUMNS,
            apiEndpoint: "http://localhost:8000/api/kb/records",
            getRowKey: (item: any) => item.record_id,
            dataKey: "records",
            emptyMessage: "No knowledge base data available",
            refreshEvent: "kb-data-refresh",
        },
    },
    c: {
        id: "c",
        name: "内容检测Agent",
        layout: {
            left: ["history", "document"],
            defaultLeft: "document",
            right: ["chat"],
            defaultRight: "chat",
        },
    },
    w: {
        id: "w",
        name: "写作助手Agent",
        layout: {
            left: ["history", "document"],
            defaultLeft: "history",
            right: ["chat"],
            defaultRight: "chat",
        },
    },
}