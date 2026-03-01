import { Button } from "@/shared/ui/button";
import { Plus, FolderPlus } from "lucide-react";
// import { FolderPlusIcon } from "@/shared/ui/icons";

export function DataHeader() {
  return (
    <div className="flex flex-row items-center w-full">
      <h2 className="text-sm font-semibold text-foreground">DATA</h2>

      <div className="ml-auto flex items-center gap-2">
        <Button variant="outline" size="sm" className="text-xs gap-2.5">
          <FolderPlus className="size-4" strokeWidth={3} />
          <span>New Folder</span>
        </Button>
        <Button size="sm" className="text-xs gap-2.5 items-center justify-center">
          <Plus className="size-4" strokeWidth={3} />
          <span>Add File</span>
        </Button>
      </div> 
    </div>
  );
}
