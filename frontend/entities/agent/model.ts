// entities/agent/model.ts

export type AgentId = "kb" | "c" | "w";

export interface Agent {
    id: AgentId;
    name: string;
    layout: LayoutType;
}

export type UIModule =
    | "chat"
    | "history"
    | "knowledgebase"
    | "document";

export type LayoutType = {
    left: UIModule[];
    defaultLeft: UIModule;
    right: UIModule[];
    defaultRight: UIModule;
}
