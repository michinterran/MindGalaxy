import { describe, expect, it } from "vitest";
import { BRAND_COPY } from "@/config/brand";
import { buildBrandMetadata } from "@/config/brand-metadata";

describe("brand metadata", () => {
  it.each([
    ["ko", "ko_KR"],
    ["en", "en_US"],
  ] as const)("uses the %s brand copy and OpenGraph locale", (locale, ogLocale) => {
    const metadata = buildBrandMetadata(locale);
    const brand = BRAND_COPY[locale];

    expect(metadata.title).toEqual({
      default: `MindGalaxy — ${brand.slogan}`,
      template: "%s | MindGalaxy",
    });
    expect(metadata.description).toBe(brand.description);
    expect(metadata.openGraph).toMatchObject({
      title: `MindGalaxy — ${brand.slogan}`,
      description: brand.description,
      locale: ogLocale,
    });
    expect(metadata.twitter).toMatchObject({
      title: `MindGalaxy — ${brand.slogan}`,
      description: brand.description,
    });
  });
});
