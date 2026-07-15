import type { Metadata } from "next";
import { BRAND_COPY } from "@/config/brand";

type BrandLocale = keyof typeof BRAND_COPY;

const OPEN_GRAPH_LOCALE = {
  ko: "ko_KR",
  en: "en_US",
} as const satisfies Record<BrandLocale, string>;

export function buildBrandMetadata(locale: BrandLocale): Metadata {
  const brand = BRAND_COPY[locale];
  const title = `MindGalaxy — ${brand.slogan}`;

  return {
    title: {
      default: title,
      template: "%s | MindGalaxy",
    },
    description: brand.description,
    openGraph: {
      title,
      description: brand.description,
      locale: OPEN_GRAPH_LOCALE[locale],
      siteName: "MindGalaxy",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: brand.description,
    },
  };
}
