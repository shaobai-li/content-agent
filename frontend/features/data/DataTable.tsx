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
import type { KnowledgeBaseDragData } from "@/shared/lib/dragData";
import { writeKnowledgeBaseDragData } from "@/shared/lib/dragData";
import { useTranslation } from "react-i18next";

interface InferredColumn {
    key: string;
    label: string;
    width?: string;
    minWidth?: string;
    className?: string;
    render: (row: any) => React.ReactNode;
}

interface DataTableProps {
    data: any[];
    allData?: any[];
    rowKeyField: string;
    columnLabels?: Record<string, string>;
    customRenderers?: Record<string, (row: any) => React.ReactNode>;
    columnWidths?: Record<string, string>;
    columnMinWidths?: Record<string, string>;
    tableMinWidth?: string;
    columnOrder?: string[];
    getDragData?: (row: any) => KnowledgeBaseDragData | null;
    loading?: boolean;
    emptyMessage?: string;
    onView?: (item: any) => void;
    onMove?: (item: any, parentId: string) => Promise<void>;
    onRename?: (item: any, name: string) => Promise<void>;
    onRemove?: (item: any) => void;
}

export function DataTable({
    data,
    allData = data,
    rowKeyField,
    columnLabels = {},
    customRenderers = {},
    columnWidths = {},
    columnMinWidths = {},
    tableMinWidth,
    columnOrder,
    getDragData,
    loading = false,
    emptyMessage = "鏆傛棤鏁版嵁",
    onView,
    onMove,
    onRename,
    onRemove,
}: DataTableProps) {
    const { t } = useTranslation();
    const [moveDialogOpen, setMoveDialogOpen] = useState(false);
    const [renameModalOpen, setRenameModalOpen] = useState(false);
    const [selectedRecord, setSelectedRecord] = useState<any | null>(null);
    const [moveTargetRecord, setMoveTargetRecord] = useState<any | null>(null);

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

    const handleMoveDialogChange = (open: boolean) => {
        setMoveDialogOpen(open);
        if (!open) {
            setMoveTargetRecord(null);
        }
    };

    const handleDragStart = (event: React.DragEvent<HTMLElement>, item: any) => {
        const payload = getDragData?.(item);
        if (!payload) {
            return;
        }

        writeKnowledgeBaseDragData(event.dataTransfer, payload);
    };

    const columns = useMemo<InferredColumn[]>(() => {
        if (data.length === 0) return [];

        const firstRow = data[0];
        const keys = columnOrder || Object.keys(firstRow).filter(k => k !== rowKeyField);

        return keys.map(key => ({
            key,
            label: columnLabels[key] || key,
            width: columnWidths[key],
            minWidth: columnMinWidths[key],
            className: customRenderers[key] ? "" : "text-xs text-muted-foreground",
            render: customRenderers[key] || ((row: any) => {
                const value = row[key];
                if (Array.isArray(value)) {
                    return value.length > 0 ? value.join(", ") : t("data.empty");
                }
                return String(value || "");
            }),
        }));
    }, [data, rowKeyField, columnLabels, customRenderers, columnWidths, columnMinWidths, columnOrder, t]);

    const finalColumns: InferredColumn[] = [
        ...columns,
        {
            key: "actions",
            label: "",
            width: "72px",
            className: "",
            render: (record: any) => (
                <div className="flex justify-end" onDragStart={(event) => event.stopPropagation()}>
                    <RowActions
                        actions={[
                            {
                                label: t("data.view"),
                                icon: <Eye className="size-4" />,
                                onClick: () => onView?.(record),
                            },
                            {
                                label: t("data.move"),
                                icon: <FolderInput className="size-4" />,
                                onClick: () => {
                                    setMoveTargetRecord(record);
                                    setMoveDialogOpen(true);
                                },
                            },
                            {
                                label: t("data.rename"),
                                icon: <Pencil className="size-4" />,
                                onClick: () => handleRenameOpen(record),
                            },
                            {
                                label: t("data.delete"),
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
                {t("data.loading")}
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
            <style>{`
              [data-table-container] {
                container-type: inline-size;
                container-name: data-table;
              }
              @container data-table (max-width: 300px) {
                .col-file_ext,
                .col-size_bytes,
                .col-created_at {
                  display: none;
                }
              }
            `}</style>
            <div
                className="overflow-hidden border rounded-lg bg-white shadow-sm"
                data-table-container
                style={tableMinWidth ? { minWidth: tableMinWidth } : undefined}
            >
                <Table className="table-fixed">
                    <TableHeader>
                        <TableRow>
                            {finalColumns.map((col) => (
                                <TableHead
                                    key={col.key}
                                    className={`text-xs font-semibold text-muted-foreground px-3 col-${col.key}`}
                                    style={col.width || col.minWidth ? { width: col.width, minWidth: col.minWidth } : undefined}
                                >
                                    {col.label}
                                </TableHead>
                            ))}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {data.map((item, index) => (
                            <TableRow
                                key={getRowKey(item, index)}
                                className="group"
                                draggable={Boolean(getDragData?.(item))}
                                onDragStart={(event) => handleDragStart(event, item)}
                            >
                                {finalColumns.map((col) => (
                                    <TableCell
                                        key={col.key}
                                        className={`px-3 py-4 overflow-hidden col-${col.key} ${col.className || ''}`}
                                        style={col.width || col.minWidth ? { width: col.width, minWidth: col.minWidth } : undefined}
                                    >
                                        {col.render(item)}
                                    </TableCell>
                                ))}
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
            <MoveToFolderDialog
                open={moveDialogOpen}
                onOpenChange={handleMoveDialogChange}
                data={allData}
                record={moveTargetRecord}
                onMove={onMove}
            />
            <RenameModal
                open={renameModalOpen}
                onOpenChange={handleRenameModalChange}
                record={selectedRecord}
                onRename={onRename}
            />
        </>
    );
}

