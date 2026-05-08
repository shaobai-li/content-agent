import { Button } from "@/shared/ui/button";

export function SettingsHeader() {
  return (
    <div className="flex w-full flex-row items-center justify-between">
      <h2 className="text-sm font-semibold text-foreground">SETTINGS</h2>
      <div className="flex shrink-0 items-center gap-2">
        <Button type="button" variant="outline">
          Cancel
        </Button>
        <Button type="button">Enter</Button>
      </div>
    </div>
  );
}
