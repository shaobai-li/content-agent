import { Agent } from "./model";

export const agentRegistry: Record<Agent['id'], Agent> = {
    nm: {
        id: "nm",
        name: "笔记管理",
        uiModules: ["chat", "history", "knowledgebase"],
    },
    kb: {
        id: "kb",
        name: "知识库",
        uiModules: ["chat", "history", "knowledgebase"],
    },
    c: {
        id: "c",
        name: "内容检测",
        uiModules: ["chat", "history", "document"],
    },
    w: {
        id: "w",
        name: "写作助手",
        uiModules: ["chat", "history", "document"],
    },
}