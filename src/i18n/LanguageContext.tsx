"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

import {
  defaultLocale,
  htmlLang,
  intlLocale,
  LOCALE_COOKIE,
  type Locale,
} from "./config";
import { dictionaries, type TranslationKey } from "./dictionaries";

type Vars = Record<string, string | number>;

type LanguageContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({
  initialLocale = defaultLocale,
  children,
}: {
  initialLocale?: Locale;
  children: React.ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    // Persist so the server renders the same language on the next request.
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = htmlLang[next];
  }, []);

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);

  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  );
}

function lookup(locale: Locale, key: TranslationKey): string {
  let node: unknown = dictionaries[locale];
  for (const part of key.split(".")) {
    node = (node as Record<string, unknown> | undefined)?.[part];
  }
  return typeof node === "string" ? node : key;
}

export function useTranslation() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useTranslation must be used inside <LanguageProvider>.");
  }
  const { locale, setLocale } = ctx;

  const t = useCallback(
    (key: TranslationKey, vars?: Vars) => {
      const text = lookup(locale, key);
      if (!vars) return text;
      return text.replace(/\{(\w+)\}/g, (match, name: string) =>
        name in vars ? String(vars[name]) : match,
      );
    },
    [locale],
  );

  const formatNumber = useCallback(
    (n: number) => {
      try {
        return n.toLocaleString(intlLocale[locale]);
      } catch {
        return n.toLocaleString();
      }
    },
    [locale],
  );

  const formatDate = useCallback(
    (d: Date | string) => {
      const date = new Date(d);
      try {
        return date.toLocaleDateString(intlLocale[locale]);
      } catch {
        return date.toLocaleDateString();
      }
    },
    [locale],
  );

  return { t, locale, setLocale, formatNumber, formatDate };
}
