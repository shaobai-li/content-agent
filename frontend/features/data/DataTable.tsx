"use client";

import { useMemo, useState } from "react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/shared/ui/table";
import { RowActions } from "./RowActions";
import { Eye, FolderInput, Pencil, Trash2 } from "lucide-react";
import { MoveToFolderDialog } from "./MoveToFolderDialog";
import { RenameModal } from "./RenameModal";

interface InferredColumn {
    key: string;
    label: string;
    width?: string;
    className?: string;
    render: (row: any) => React.ReactNode;
}

interface DataTableProps {
    data: any[];
    rowKeyField: string;
    columnLabels?: Record<string, string>;
    customRenderers?: Record<string, (row: any) => React.ReactNode>;
    columnWidths?: Record<string, string>;
    columnOrder?: string[];
    loading?: boolean;
    emptyMessage?: string;
    onView?: (item: any) => void;
    onRename?: (item: any, name: string) => Promise<void>;
    onRemove?: (item: any) => void;
}

export function DataTable({
    data,
    rowKeyField,
    columnLabels = {},
    customRenderers = {},
    columnWidths = {},
    columnOrder,
    loading = false,
    emptyMessage = "暂无数据",
    onView,
    onRename,
    onRemove,
}: DataTableProps) {
    const [moveDialogOpen, setMoveDialogOpen] = useState(false);
    const [renameModalOpen, setRenameModalOpen] = useState(false);
    const [selectedRecord, setSelectedRecord] = useState<any | null>(null);

    const getRowKey = (item: any, index: number) =>
        item[rowKeyField] ?? item.id ?? item.record_id ?? `${item.name || "row"}-${index}`;

    const handleRenameOpen = (record: any) => {
        if (!onRename) return;
        setSelectedRecord(record);
        setRenameModalOpen(true);
    };

    const handleRenameModalChange = (open: boolean) => {
        setRenameModalOpen(open);
        if (!open) {
            setSelectedRecord(null);
        }
    };

    const columns = useMemo<InferredColumn[]>(() => {
        if (data.length === 0) return [];

        const firstRow = data[0];
        const keys = columnOrder || Object.keys(firstRow).filter(k => k !== rowKeyField);

        return keys.map(key => ({
            key,
            label: columnLabels[key] || key,
            width: columnWidths[key],
            className: customRenderers[key] ? "" : "text-xs text-muted-foreground",
            render: customRenderers[key] || ((row: any) => {
                const value = row[key];
                if (Array.isArray(value)) {
                    return value.length > 0 ? value.join(", ") : "无";
                }
                return String(value || "");
            }),
        }));
    }, [data, rowKeyField, columnLabels, customRenderers, columnWidths, columnOrder]);

    const finalColumns: InferredColumn[] = [
        ...columns,
        {
            key: "actions",
            label: "",
            width: "50px",
            className: "",
            render: (record: any) => (
                <div className="flex justify-end">
                    <RowActions
                        actions={[
                            {
                                label: "View",
                                icon: <Eye className="size-4" />,
                                onClick: () => onView?.(record),
                            },
                            {
                                label: "Move",
                                icon: <FolderInput className="size-4" />,
                                onClick: () => setMoveDialogOpen(true),
                            },
                            {
                                label: "Rename",
                                icon: <Pencil className="size-4" />,
                                onClick: () => handleRenameOpen(record),
                            },
                            {
                                label: "Remove",
                                icon: <Trash2 className="size-4 text-red-600" />,
                                destructive: true,
                                onClick: () => onRemove?.(record),
                            },
                        ]}
                    />
                </div>
            ),
        },
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
        <>
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
                        {data.map((item, index) => (
                            <TableRow key={getRowKey(item, index)} className="group">
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
            <MoveToFolderDialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen} />
            <RenameModal
                open={renameModalOpen}
                onOpenChange={handleRenameModalChange}
                record={selectedRecord}
                onRename={onRename}
            />
        </>
    );
}
