"use client";

import { FolderIcon } from "@heroicons/react/24/solid";
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

const mockFolders = ["文件夹1", "文件夹2", "文件夹3", "文件夹4", "文件夹5", "文件夹6", "文件夹7"];

export function MoveToFolderDialog({ open, onOpenChange }: MoveToFolderDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent showCloseButton={false}>
                <DialogHeader>
                    <DialogTitle>Move to Folder</DialogTitle>
                    <DialogDescription>Select a folder to move the document to.</DialogDescription>
                </DialogHeader>
                <div className="max-h-[280px] overflow-y-auto divide-y divide-border">
                    {mockFolders.map(folder => (
                        <button
                            key={folder}
                            type="button"
                            className="flex w-full items-center gap-3 px-0 py-3 text-left transition-colors hover:bg-muted/80"
                        >
                            <FolderIcon className="size-5 shrink-0 text-foreground" />
                            <span className="text-sm text-foreground">{folder}</span>
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
