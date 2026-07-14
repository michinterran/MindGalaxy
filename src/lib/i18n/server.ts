import { cookies, headers } from "next/headers";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/lib/i18n";

const LOCALE_COOKIE = "mindgalaxy.locale";

function localeFromAcceptLanguage(header: string | null): Locale | null {
  if (!header) return null;

  for (const item of header.split(",")) {
    const language = item.trim().split(";")[0]?.toLowerCase();
    const baseLanguage = language?.split("-")[0];

    if (isLocale(baseLanguage)) {
      return baseLanguage;
    }
  }

  return null;
}

export async function getRequestLocale(): Promise<Locale> {
  const cookieLocale = (await cookies()).get(LOCALE_COOKIE)?.value;

  if (isLocale(cookieLocale)) {
    return cookieLocale;
  }

  return localeFromAcceptLanguage((await headers()).get("accept-language")) ?? DEFAULT_LOCALE;
}
