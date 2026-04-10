"use client";

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

export function MoveToFolderDialog({ open, onOpenChange }: MoveToFolderDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent showCloseButton={false}>
                <DialogHeader>
                    <DialogTitle>Move to Folder</DialogTitle>
                    <DialogDescription>Select a folder to move the document to.</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
                    <Button>移动</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
