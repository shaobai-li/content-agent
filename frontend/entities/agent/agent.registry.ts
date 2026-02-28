import { Agent } from "./model";

export const agentRegistry: Record<Agent['id'], Agent> = {
    nm: {
        id: "nm",
        name: "笔记管理Agent",
        uiModules: ["chat", "history", "knowledgebase"],
        defaultUI: "knowledgebase",
    },
    kb: {
        id: "kb",
        name: "知识库Agent",
        uiModules: ["chat", "history", "knowledgebase"],
        defaultUI: "knowledgebase",
    },
    c: {
        id: "c",
        name: "内容检测Agent",
        uiModules: ["chat", "history", "document"],
        defaultUI: "document",
    },
    w: {
        id: "w",
        name: "写作助手Agent",
        uiModules: ["chat", "history", "document"],
        defaultUI: "history",
    },
}