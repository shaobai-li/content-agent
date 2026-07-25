import { Search } from "lucide-react";
import { Input } from "@/shared/ui/input";
import { useTranslation } from "react-i18next";

export function HistoryHeader() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-row items-center justify-between w-full">
      <h2 className="text-sm font-semibold text-foreground">{t("sidebar.nav.history")}</h2>
      <div className="flex items-center bg-muted rounded-md focus-visible:ring-2 px-4 py-0 text-xs" >
          <Search className="w-4 h-4 shrink-0 text-muted-foreground" />
          <Input placeholder={t("kb.search")} className="h-8 text-xs w-full border-none focus-visible:ring-0 placeholder:text-muted-foreground shadow-none" />
      </div>
    </div>
  );
}