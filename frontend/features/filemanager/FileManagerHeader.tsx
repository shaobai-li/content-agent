"use client";

import { FilePlus, FolderPlus, RefreshCw } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { useTranslation } from "react-i18next";

export function FileManagerHeader() {
  const { t } = useTranslation();

  return (
    <div className="flex w-full flex-row items-center justify-between">
      <h2 className="text-sm font-semibold text-foreground">{t("sidebar.nav.fileManager")}</h2>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("filemanager.newFile")}
          title={t("filemanager.newFile")}
        >
          <FilePlus className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("filemanager.newFolder")}
          title={t("filemanager.newFolder")}
        >
          <FolderPlus className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("filemanager.refresh")}
          title={t("filemanager.refresh")}
        >
          <RefreshCw className="size-4" />
        </Button>
      </div>
    </div>
  );
}
