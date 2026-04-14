"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { FolderIcon, FolderOpenIcon } from "@heroicons/react/24/solid";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from "@/shared/ui/breadcrumb";

interface MoveToFolderDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    data?: any[];
    record?: any | null;
}

interface FolderNode {
    id: string;
    name: string;
    parent_id?: string | null;
}

const ROOT_FOLDER_ID = "fld_root";

function buildMovableFolders(data: any[], record?: any | null) {
    const folders = data.filter(
        item =>
            item?.node_type === "folder" &&
            typeof item.id === "string" &&
            item.id !== ROOT_FOLDER_ID,
    ) as FolderNode[];
    const childrenByParent = new Map<string, FolderNode[]>();
    const folderMap = new Map<string, FolderNode>();
    const excludedIds = new Set<string>();

    if (record?.node_type === "folder" && typeof record.id === "string") {
        const pendingIds = [record.id];

        while (pendingIds.length > 0) {
            const folderId = pendingIds.pop();
            if (!folderId || excludedIds.has(folderId)) {
                continue;
            }

            excludedIds.add(folderId);

            for (const folder of folders) {
                if (folder.parent_id === folderId) {
                    pendingIds.push(folder.id);
                }
            }
        }
    }

    const visibleFolderIds = new Set(
        folders
            .filter(folder => !excludedIds.has(folder.id))
            .map(folder => folder.id),
    );

    for (const folder of folders) {
        if (excludedIds.has(folder.id)) {
            continue;
        }

        folderMap.set(folder.id, folder);

        const parentId =
            typeof folder.parent_id === "string" && visibleFolderIds.has(folder.parent_id)
                ? folder.parent_id
                : ROOT_FOLDER_ID;
        const siblings = childrenByParent.get(parentId) ?? [];
        siblings.push(folder);
        childrenByParent.set(parentId, siblings);
    }

    return { childrenByParent, folderMap };
}

export function MoveToFolderDialog({
    open,
    onOpenChange,
    data = [],
    record = null,
}: MoveToFolderDialogProps) {
    const [currentFolderId, setCurrentFolderId] = useState(ROOT_FOLDER_ID);

    const { childrenByParent, folderMap } = useMemo(
        () => buildMovableFolders(data, record),
        [data, record],
    );

    useEffect(() => {
        if (!open) {
            setCurrentFolderId(ROOT_FOLDER_ID);
        }
    }, [open]);

    useEffect(() => {
        if (currentFolderId === ROOT_FOLDER_ID) {
            return;
        }

        if (!folderMap.has(currentFolderId)) {
            setCurrentFolderId(ROOT_FOLDER_ID);
        }
    }, [currentFolderId, folderMap]);

    const currentFolders = childrenByParent.get(currentFolderId) ?? [];

    const pathStack = useMemo(() => {
        const path: FolderNode[] = [];
        const visited = new Set<string>();
        let folderId: string | null = currentFolderId;

        while (folderId && folderId !== ROOT_FOLDER_ID && !visited.has(folderId)) {
            visited.add(folderId);

            const folder = folderMap.get(folderId);
            if (!folder) {
                break;
            }

            path.unshift(folder);
            folderId = typeof folder.parent_id === "string" ? folder.parent_id : ROOT_FOLDER_ID;
        }

        return path;
    }, [currentFolderId, folderMap]);

    const handleFolderClick = (folder: FolderNode) => {
        if (!childrenByParent.has(folder.id)) return;
        setCurrentFolderId(folder.id);
    };

    const handleBreadcrumbClick = (targetLevel: number) => {
        if (targetLevel < 0) {
            setCurrentFolderId(ROOT_FOLDER_ID);
            return;
        }

        const targetFolder = pathStack[targetLevel];
        if (targetFolder?.id) {
            setCurrentFolderId(targetFolder.id);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent showCloseButton={false} className="flex h-[560px] flex-col sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Move to Folder</DialogTitle>
                </DialogHeader>
                <Breadcrumb>
                    <BreadcrumbList className="text-xs">
                        <BreadcrumbItem>
                            {pathStack.length === 0 ? (
                                <BreadcrumbPage>
                                    <FolderOpenIcon className="size-4" />
                                </BreadcrumbPage>
                            ) : (
                                <BreadcrumbLink
                                    asChild
                                    className="cursor-pointer"
                                >
                                    <button
                                        type="button"
                                        onClick={() => handleBreadcrumbClick(-1)}
                                        aria-label="返回根目录"
                                    >
                                        <FolderOpenIcon className="size-4" />
                                    </button>
                                </BreadcrumbLink>
                            )}
                        </BreadcrumbItem>

                        {pathStack.map((folder, index) => {
                            const isCurrent = index === pathStack.length - 1;

                            return (
                                <Fragment key={`${folder.id}-${index}`}>
                                    <BreadcrumbSeparator />
                                    <BreadcrumbItem>
                                        {isCurrent ? (
                                            <BreadcrumbPage>{folder.name}</BreadcrumbPage>
                                        ) : (
                                            <BreadcrumbLink
                                                asChild
                                                className="cursor-pointer"
                                            >
                                                <button
                                                    type="button"
                                                    onClick={() => handleBreadcrumbClick(index)}
                                                >
                                                    {folder.name}
                                                </button>
                                            </BreadcrumbLink>
                                        )}
                                    </BreadcrumbItem>
                                </Fragment>
                            );
                        })}
                    </BreadcrumbList>
                </Breadcrumb>
                <div className="min-h-0 flex-1 overflow-y-auto divide-y divide-border">
                    {currentFolders.length > 0 ? (
                        currentFolders.map(folder => (
                            <button
                                key={folder.id}
                                type="button"
                                onClick={() => handleFolderClick(folder)}
                                className="flex w-full items-center gap-3 px-0 py-3 text-left transition-colors hover:bg-muted/80"
                            >
                                <FolderIcon className="size-5 shrink-0 text-foreground" />
                                <span className="text-sm text-foreground">{folder.name}</span>
                            </button>
                        ))
                    ) : (
                        <div className="py-8 text-center text-sm text-muted-foreground">
                            暂无可移动到的文件夹
                        </div>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
                    <Button>移动</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
