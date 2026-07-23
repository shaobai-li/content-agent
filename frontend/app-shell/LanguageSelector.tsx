"use client";

import { useTranslation } from "react-i18next";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";

type Language = {
  value: string;
  label: string;
};

const LANGUAGES: Language[] = [
  { value: "zh-CN", label: "中文" },
  { value: "en-US", label: "English" },
];

export function LanguageSelector() {
  const { t, i18n } = useTranslation();
  const selected = LANGUAGES.find((l) => l.value === i18n.language);

  return (
    <div className="flex items-start justify-between gap-12">
      <div className="flex flex-col gap-0.5">
        <label className="text-sm font-medium text-foreground">
          {t("settings.language.label")}
        </label>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {t("settings.language.desc")}
        </p>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="h-9 w-[140px] justify-end gap-1.5 px-3 font-normal shrink-0 border border-transparent hover:border-input hover:bg-background data-[state=open]:border-input data-[state=open]:bg-background"
          >
            <span>{selected ? selected.label : i18n.language}</span>
            <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-[var(--radix-dropdown-menu-trigger-width)]"
          align="start"
        >
          {LANGUAGES.map((lang) => (
            <DropdownMenuItem
              key={lang.value}
              onSelect={() => i18n.changeLanguage(lang.value)}
            >
              <Check
                className={`mr-2 size-4 shrink-0 ${
                  i18n.language === lang.value ? "opacity-100" : "opacity-0"
                }`}
              />
              {lang.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
