import { Agent } from "./model";

export const agentRegistry: Record<Agent["id"], Agent> = {
    kb: {
        id: "kb",
        name: "知识库Agent",
        layout: {
            left: ["history", "knowledgebase"],
            defaultLeft: "knowledgebase",
            right: ["chat"],
            defaultRight: "chat",
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
            defaultLeft: "document",
            right: ["chat"],
            defaultRight: "chat",
        },
    },
};
