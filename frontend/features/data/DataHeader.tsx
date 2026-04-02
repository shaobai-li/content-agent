import { Button } from "@/shared/ui/button";
import { Plus, FolderPlus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";

export function DataHeader() {
  return (
    <div className="flex flex-row items-center w-full">
      <h2 className="text-sm font-semibold text-foreground">DATA</h2>

      <div className="ml-auto flex items-center">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon-sm" aria-label="Create new item">
              <Plus className="size-4" strokeWidth={3} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-36">
            <DropdownMenuItem className="gap-2.5">
              <FolderPlus className="size-4" strokeWidth={3} />
              <span>New Folder</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2.5">
              <Plus className="size-4" strokeWidth={3} />
              <span>Add File</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
