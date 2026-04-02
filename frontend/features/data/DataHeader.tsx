import { Button } from "@/shared/ui/button";
import { Plus, FolderPlus, Search } from "lucide-react";
import { Input } from "@/shared/ui/input";
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

      <div className="ml-auto flex items-center gap-4">
        <div className="flex items-center bg-muted rounded-md focus-visible:ring-2 px-4 py-0 text-xs">
          <Search className="w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search data..."
            className="h-8 text-xs w-full border-none focus-visible:ring-0 placeholder:text-muted-foreground shadow-none"
          />
        </div>
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
