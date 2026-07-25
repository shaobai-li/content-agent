import { useTranslation } from "react-i18next";

export function CanvasHeader() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-row items-center w-full">
      <h2 className="text-sm font-semibold text-foreground">{t("sidebar.nav.document")}</h2>
    </div>
  );
}
