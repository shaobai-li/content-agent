"use client";

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";

export interface DataTableColumn<T> {
    key: string;
    label: string;
    render: (item: T) => React.ReactNode;
}

interface DataTableProps<T> {
    columns: DataTableColumn<T>[];
    data: T[];
    getRowKey: (item: T) => string;
    loading?: boolean;
    emptyMessage?: string;
}

export function DataTable<T>({
    columns,
    data,
    getRowKey,
    loading = false,
    emptyMessage = "暂无数据"
}: DataTableProps<T>) {
    if (loading) {
        return (
        <div className="h-full flex items-center justify-center">
            加载中...
        </div>
        );
    }

    if (data.length === 0) {
        return (
        <div className="h-full flex items-center justify-center text-gray-400">
            {emptyMessage}
        </div>
        );
    }

    return (
        <div className="overflow-auto border rounded-lg bg-white shadow-sm">
        <Table>
            <TableHeader>
            <TableRow>
                {columns.map((col) => (
                <TableHead key={col.key} className="text-xs font-semibold text-muted-foreground px-6">
                    {col.label}
                </TableHead>
                ))}
            </TableRow>
            </TableHeader>
            <TableBody>
            {data.map((item) => (
                <TableRow key={getRowKey(item)}>
                {columns.map((col) => (
                    <TableCell key={col.key} className="p-0">
                    {col.render(item)}
                    </TableCell>
                ))}
                </TableRow>
            ))}
            </TableBody>
        </Table>
        </div>
    );
}

