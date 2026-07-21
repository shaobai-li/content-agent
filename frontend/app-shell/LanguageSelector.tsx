"use client";

import { useCallback, useEffect, useState } from "react";
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
  locale: string;
};

const LANGUAGES: Language[] = [
  { value: "zh-CN", label: "中文", locale: "zh-CN" },
  { value: "en-US", label: "English", locale: "en-US" },
];

const STORAGE_KEY = "app-language";
const DEFAULT_LANG = "zh-CN";

function getStoredLanguage(): string {
  if (typeof window === "undefined") return DEFAULT_LANG;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored && LANGUAGES.some((l) => l.value === stored) ? stored : DEFAULT_LANG;
  } catch {
    return DEFAULT_LANG;
  }
}

function setHtmlLang(locale: string) {
  document.documentElement.lang = locale;
}

export function LanguageSelector() {
  const [current, setCurrent] = useState<string>(() => getStoredLanguage());

  useEffect(() => {
    const lang = LANGUAGES.find((l) => l.value === current);
    if (lang) setHtmlLang(lang.locale);
  }, [current]);

  const handleSelect = useCallback((value: string) => {
    setCurrent(value);
    localStorage.setItem(STORAGE_KEY, value);
  }, []);

  const selected = LANGUAGES.find((l) => l.value === current);

  return (
    <div className="flex items-start justify-between gap-12">
      <div className="flex flex-col gap-0.5">
        <label className="text-sm font-medium text-foreground">
          语言
        </label>
        <p className="text-xs text-muted-foreground leading-relaxed">
          更改 OmniAge 的显示语言
        </p>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="h-9 w-[140px] justify-end gap-1.5 px-3 font-normal shrink-0 hover:border hover:border-input hover:bg-background data-[state=open]:border data-[state=open]:border-input data-[state=open]:bg-background"
          >
            <span>{selected ? selected.label : DEFAULT_LANG}</span>
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
              onSelect={() => handleSelect(lang.value)}
            >
              <Check
                className={`mr-2 size-4 shrink-0 ${
                  current === lang.value ? "opacity-100" : "opacity-0"
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
