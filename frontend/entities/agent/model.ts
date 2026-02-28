// entities/agent/model.ts

import { ReactNode } from "react";

export type AgentId = "nm" | "kb" | "c" | "w";

export interface DataPanelConfig {
    fetchData: () => Promise<any>;
    rowKeyField: string;
    dataKey?: string;
    emptyMessage?: string;
    refreshEvent?: string;
    columnLabels?: Record<string, string>;
    customRenderers?: Record<string, (row: any) => ReactNode>;
    columnWidths?: Record<string, string>;
    columnOrder?: string[];
}

export interface Agent {
    id: AgentId;
    name: string;
    layout: LayoutType;
    dataPanelConfig?: DataPanelConfig;
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
