"use client";

import { useTranslation } from "react-i18next";

export function SettingsHeader() {
  const { t } = useTranslation();
  return (
    <div className="flex w-full flex-row items-center justify-between">
      <h2 className="text-sm font-semibold text-foreground">{t("settingsPanel.header.title")}</h2>
    </div>
  );
}

