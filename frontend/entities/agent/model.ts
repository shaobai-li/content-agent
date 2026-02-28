// entities/agent/model.ts

import { ReactNode } from "react";
import { DataTableColumn } from "@/components/features/data/DataTable";

export type AgentId = "nm" | "kb" | "c" | "w";

export interface DataPanelConfig<T = any> {
    columns: DataTableColumn<T>[];
    apiEndpoint: string;
    getRowKey: (item: T) => string;
    dataKey?: string;
    emptyMessage?: string;
    refreshEvent?: string;
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
