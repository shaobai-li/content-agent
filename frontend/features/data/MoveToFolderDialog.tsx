"use client";

import { useEffect, useState } from "react";
import { ChevronLeftIcon, FolderIcon } from "@heroicons/react/24/solid";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";

interface MoveToFolderDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

interface FolderNode {
    name: string;
    children?: FolderNode[];
}

const mockFolders: FolderNode[] = [
    {
        name: "文件夹1",
        children: [
            { name: "文件夹1-1" },
            {
                name: "文件夹1-2",
                children: [{ name: "文件夹1-2-1" }, { name: "文件夹1-2-2" }],
            },
        ],
    },
    { name: "文件夹2" },
    { name: "文件夹3", children: [{ name: "文件夹3-1" }, { name: "文件夹3-2" }] },
    { name: "文件夹4" },
    { name: "文件夹5" },
    { name: "文件夹6" },
    { name: "文件夹7" },
];

export function MoveToFolderDialog({ open, onOpenChange }: MoveToFolderDialogProps) {
    const [folderStack, setFolderStack] = useState<FolderNode[][]>([mockFolders]);
    const [pathStack, setPathStack] = useState<string[]>([]);

    useEffect(() => {
        if (!open) {
            setFolderStack([mockFolders]);
            setPathStack([]);
        }
    }, [open]);

    const currentFolders = folderStack[folderStack.length - 1];

    const handleFolderClick = (folder: FolderNode) => {
        if (!folder.children?.length) return;
        setFolderStack(prev => [...prev, folder.children!]);
        setPathStack(prev => [...prev, folder.name]);
    };

    const handleBack = () => {
        setFolderStack(prev => (prev.length > 1 ? prev.slice(0, -1) : prev));
        setPathStack(prev => (prev.length > 0 ? prev.slice(0, -1) : prev));
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent showCloseButton={false}>
                <DialogHeader>
                    <DialogTitle>Move to Folder</DialogTitle>
                    <DialogDescription>Select a folder to move the document to.</DialogDescription>
                </DialogHeader>
                {pathStack.length > 0 && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <button
                            type="button"
                            onClick={handleBack}
                            className="flex items-center gap-1 hover:text-foreground transition-colors"
                        >
                            <ChevronLeftIcon className="size-4" />
                            返回上一级
                        </button>
                        <span>/ {pathStack.join(" / ")}</span>
                    </div>
                )}
                <div className="max-h-[280px] overflow-y-auto divide-y divide-border">
                    {currentFolders.map(folder => (
                        <button
                            key={folder.name}
                            type="button"
                            onClick={() => handleFolderClick(folder)}
                            className="flex w-full items-center gap-3 px-0 py-3 text-left transition-colors hover:bg-muted/80"
                        >
                            <FolderIcon className="size-5 shrink-0 text-foreground" />
                            <span className="text-sm text-foreground">{folder.name}</span>
                        </button>
                    ))}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
                    <Button>移动</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
