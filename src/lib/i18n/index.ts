import { messages } from "@/lib/i18n/messages";

export type Locale = keyof typeof messages;
export const DEFAULT_LOCALE = "ko" satisfies Locale;

type MessageDictionary = (typeof messages)[typeof DEFAULT_LOCALE];
export type MessageKey = keyof MessageDictionary;

type MessageValues = Record<string, string | number>;

export function isLocale(value: string | null | undefined): value is Locale {
  return value === "ko" || value === "en";
}

export function getLocale(value?: string | null): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export function t(
  locale: Locale,
  key: MessageKey,
  values: MessageValues = {},
): string {
  const template = messages[locale][key] ?? messages[DEFAULT_LOCALE][key];

  return template.replace(/\{(\w+)\}/g, (_, token: string) =>
    String(values[token] ?? `{${token}}`),
  );
}

export function formatInteger(locale: Locale, value: number) {
  return new Intl.NumberFormat(t(locale, "app.locale")).format(value);
}

export function formatDateTime(locale: Locale, date: string | Date) {
  return new Intl.DateTimeFormat(t(locale, "app.locale"), {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}
