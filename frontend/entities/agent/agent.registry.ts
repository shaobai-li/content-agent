import { Agent } from "./model";

export const agentRegistry: Record<Agent["id"], Agent> = {
    std: {
        id: "std",
        name: "标准 Agent",
        layout: {
            left: ["history", "knowledgebase", "document"],
            defaultLeft: "knowledgebase",
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
