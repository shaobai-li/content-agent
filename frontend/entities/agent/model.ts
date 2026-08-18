// entities/agent/model.ts

export type AgentId = string;

export interface Agent {
    name: AgentId;     // agent 标识（目录名）
    title: string;     // 显示名
    visible: boolean;
    locked?: boolean;
    layout: LayoutType;
}

export type UIModule =
    | "chat"
    | "history"
    | "knowledgebase"
    | "canvas"
    | "settings"
    | "management";

export type LayoutType = {
    left: UIModule[];
    defaultLeft: UIModule;
    right: UIModule[];
    defaultRight: UIModule;
}
