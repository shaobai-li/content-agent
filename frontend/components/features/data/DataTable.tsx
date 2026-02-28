"use client";

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { RowActions } from "./RowActions";
import { Eye, Trash2 } from "lucide-react";

export interface DataTableColumn<T> {
    key: string;
    label: string;
    render: (item: T) => React.ReactNode;
    width?: string;
    className?: string;
}

interface DataTableProps<T> {
    columns: DataTableColumn<T>[];
    data: T[];
    getRowKey: (item: T) => string;
    loading?: boolean;
    emptyMessage?: string;
    onView?: (item: T) => void;
    onRemove?: (item: T) => void;
}

export function DataTable<T>({
    columns,
    data,
    getRowKey,
    loading = false,
    emptyMessage = "暂无数据",
    onView,
    onRemove,
}: DataTableProps<T>) {
    const finalColumns = [
        ...columns,
        {
            key: "actions",
            label: "",
            width: "50px",
            render: (record: T) => (
                <div className="flex justify-end">
                    <RowActions
                        actions={[
                            { label: "View", icon: <Eye className="size-4" /> },
                            {
                                label: "Remove",
                                icon: <Trash2 className="size-4 text-red-600" />,
                                destructive: true,
                            },
                        ]}
                    />
                </div>
            ),
        } as DataTableColumn<T>,
    ];
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
                {finalColumns.map((col) => (
                <TableHead 
                    key={col.key} 
                    className="text-xs font-semibold text-muted-foreground px-6"
                    style={col.width ? { width: col.width } : undefined}
                >
                    {col.label}
                </TableHead>
                ))}
            </TableRow>
            </TableHeader>
            <TableBody>
            {data.map((item) => (
                <TableRow key={getRowKey(item)} className="group">
                {finalColumns.map((col) => (
                    <TableCell 
                        key={col.key} 
                        className={`px-6 py-4 ${col.className || ''}`}
                        style={col.width ? { width: col.width } : undefined}
                    >
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

