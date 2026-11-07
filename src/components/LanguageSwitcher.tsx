"use client";

import { ChevronDown, Languages } from "lucide-react";

import { isLocale, localeNames, locales } from "@/i18n/config";
import { useTranslation } from "@/i18n/LanguageContext";
import { cn } from "@/lib/utils";

export function LanguageSwitcher({ className }: { className?: string }) {
  const { t, locale, setLocale } = useTranslation();

  return (
    <label
      className={cn(
        "relative inline-flex h-8 items-center gap-1.5 rounded-md border bg-background pr-7 pl-2.5 text-sm transition-colors focus-within:ring-2 focus-within:ring-ring/50 hover:bg-muted",
        className,
      )}
    >
      <Languages className="size-4 shrink-0 text-muted-foreground" />
      <span className="sr-only">{t("common.language")}</span>
      <select
        value={locale}
        onChange={(e) => {
          if (isLocale(e.target.value)) setLocale(e.target.value);
        }}
        className="cursor-pointer appearance-none bg-transparent font-medium outline-none"
      >
        {locales.map((l) => (
          <option key={l} value={l}>
            {localeNames[l]}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 size-3.5 text-muted-foreground" />
    </label>
  );
}
