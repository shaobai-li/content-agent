import { Button } from "@/components/ui/button";
import Image from "next/image";

export function DataHeader() {
  return (
    <div className="flex items-center h-16 px-4 border bg-card">
      <h2 className="text-sm font-semibold text-foreground">DATA</h2>

      <div className="ml-auto flex items-center gap-2">
        <Button variant="outline" size="sm" className="text-xs gap-2.5">
          <Image src="/new_folder.svg" alt="" width={16} height={16} />
          New Folder
        </Button>
        <Button size="sm" className="text-xs gap-2.5">
          <Image src="/add.svg" alt="" width={12} height={12} />
          Add File
        </Button>
      </div> 
    </div>
  );
}
