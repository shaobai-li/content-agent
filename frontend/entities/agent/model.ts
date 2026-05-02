// entities/agent/model.ts

export type AgentId = string;

export interface Agent {
    id: AgentId;
    name: string;
    layout: LayoutType;
}

export type UIModule =
    | "chat"
    | "history"
    | "knowledgebase"
    | "document"
    | "settings";

export type LayoutType = {
    left: UIModule[];
    defaultLeft: UIModule;
    right: UIModule[];
    defaultRight: UIModule;
}
