import { ReactNode } from "react";

export interface DataPanelConfig {
    fetchData: () => Promise<any>;
    renameData?: (recordId: string, name: string) => Promise<any>;
    deleteData?: (recordId: string) => Promise<any>;
    rowKeyField: string;
    dataKey?: string;
    emptyMessage?: string;
    refreshEvent?: string;
    columnLabels?: Record<string, string>;
    customRenderers?: Record<string, (row: any) => ReactNode>;
    columnWidths?: Record<string, string>;
    columnOrder?: string[];
}
