"use client";

import { useTranslation } from "react-i18next";

export function FileManagerHeader() {
  const { t } = useTranslation();

  return (
    <div className="flex w-full flex-row items-center justify-between">
      <h2 className="text-sm font-semibold text-foreground">{t("sidebar.nav.fileManager")}</h2>
    </div>
  );
}
