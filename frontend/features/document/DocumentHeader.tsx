import { Button } from "@/shared/ui/button";
import { Plus, FolderPlus } from "lucide-react";

export function DocumentHeader() {
  return (
    <div className="flex flex-row items-center w-full">
      <h2 className="text-sm font-semibold text-foreground">DOCUMENTS</h2>

      <div className="ml-auto flex items-center gap-2">
        <Button variant="outline" size="sm" className="text-xs gap-2.5">
          <FolderPlus className="size-4" strokeWidth={3} />
          <span>New Folder</span>
        </Button>
        <Button size="sm" className="text-xs gap-2.5">
          <Plus className="size-4" strokeWidth={3} />
          <span>Add Document</span>
        </Button>
      </div>
    </div>
  );
}

