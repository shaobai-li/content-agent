import { Search, Filter } from "lucide-react";
import { Input } from "@/shared/ui/input";
import { Button } from "@/shared/ui/button";

export function HistoryHeader() {
  return (
    <div className="flex flex-row items-center justify-between w-full">
      <h2 className="text-sm font-semibold text-foreground">HISTORY</h2>
      <div className="flex items-center bg-muted rounded-md focus-visible:ring-2 px-4 py-0 text-xs" >
          <Search className="w-4 h-4 shrink-0 text-muted-foreground" />
          <Input placeholder="Search history..." className="h-8 text-xs w-full border-none focus-visible:ring-0 placeholder:text-muted-foreground shadow-none" />
      </div>
    </div>
  );
}