import { Button } from "@/shared/ui/button";
import Image from "next/image";

export function DocumentHeader() {
  return (
    <div className="flex flex-row items-center w-full">
      <h2 className="text-sm font-semibold text-foreground">DOCUMENTS</h2>

      <div className="ml-auto flex items-center gap-2">
        <Button variant="outline" size="sm" className="text-xs gap-2.5">
          <Image src="/new_folder.svg" alt="" width={16} height={16} />
          New Folder
        </Button>
        <Button size="sm" className="text-xs gap-2.5">
          <Image src="/add.svg" alt="" width={12} height={12} />
          Add Document
        </Button>
      </div> 
    </div>
  );
}

