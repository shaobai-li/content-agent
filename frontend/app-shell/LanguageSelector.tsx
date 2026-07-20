"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ChevronsUpDown, Languages } from "lucide-react";
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
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_LANG;
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
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-foreground">
        语言 / Language
      </label>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="h-9 w-full justify-between px-3 font-normal"
          >
            <span className="flex items-center gap-2">
              <Languages className="size-4 shrink-0 text-muted-foreground" />
              <span>{selected ? selected.label : DEFAULT_LANG}</span>
            </span>
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
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
      <p className="text-xs text-muted-foreground">
        切换应用界面语言（即将支持）
      </p>
    </div>
  );
}
