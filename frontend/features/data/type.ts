import { ReactNode } from "react";
import type { KnowledgeBaseDragData } from "@/shared/lib/dragData";

export interface DataPanelConfig {
    fetchData: () => Promise<any>;
    renameData?: (recordId: string, name: string) => Promise<any>;
    moveData?: (recordId: string, parentId: string) => Promise<any>;
    deleteData?: (recordId: string) => Promise<any>;
    rowKeyField: string;
    dataKey?: string;
    emptyMessage?: string;
    refreshEvent?: string;
    columnLabels?: Record<string, string>;
    customRenderers?: Record<string, (row: any) => ReactNode>;
    columnWidths?: Record<string, string>;
    columnMinWidths?: Record<string, string>;
    tableMinWidth?: string;
    columnOrder?: string[];
    getDragData?: (row: any) => KnowledgeBaseDragData | null;
}
