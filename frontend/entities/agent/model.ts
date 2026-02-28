// entities/agent/model.ts

export type AgentId = "nm" | "kb" | "c" | "w";

export interface Agent {
    id: AgentId;
    name: string;

    uiModules: UIModule[];
}

export type UIModule =
    | "chat"
    | "history"
    | "knowledgebase"
    | "document";