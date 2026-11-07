export const locales = ["qq", "uz", "ru"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "qq";
export const LOCALE_COOKIE = "locale";

export const localeNames: Record<Locale, string> = {
  qq: "Qaraqalpaqsha",
  uz: "Oʻzbekcha",
  ru: "Русский",
};

// Language names used in AI prompts.
export const localeLanguages: Record<Locale, string> = {
  qq: "Karakalpak",
  uz: "Uzbek",
  ru: "Russian",
};

// "qq" is our app code; the BCP 47 tag for Karakalpak is "kaa".
export const htmlLang: Record<Locale, string> = {
  qq: "kaa",
  uz: "uz",
  ru: "ru",
};

// Used for number/date formatting. Falls back gracefully if unsupported.
export const intlLocale: Record<Locale, string> = {
  qq: "kaa",
  uz: "uz-Latn",
  ru: "ru-RU",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

// Error codes returned by server actions; translated under `errors.*`.
export type ErrorCode =
  | "rateLimit"
  | "aiBusy"
  | "invalidJson"
  | "badResponse"
  | "productNotFound"
  | "userNotFound"
  | "invalidPayload"
  | "noValidRows"
  | "database"
  | "forbidden"
  | "unknown";
