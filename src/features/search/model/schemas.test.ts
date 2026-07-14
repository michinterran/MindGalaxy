import { describe, expect, it } from "vitest";
import { SEARCH_REGISTRY } from "@/config/registry";
import { searchRequestSchema } from "@/features/search/model/schemas";

describe("searchRequestSchema", () => {
  it("bounds limit and trims query", () => {
    const parsed = searchRequestSchema.parse({
      workspaceId: "00000000-0000-4000-8000-000000000001",
      query: "  grounded search  ",
      limit: "5",
    });

    expect(parsed.query).toBe("grounded search");
    expect(parsed.limit).toBe(5);
    expect(parsed.locale).toBe("ko");
  });

  it("accepts explicit English locale", () => {
    const parsed = searchRequestSchema.parse({
      workspaceId: "00000000-0000-4000-8000-000000000001",
      query: "grounded search",
      locale: "en",
    });

    expect(parsed.locale).toBe("en");
  });

  it("rejects limit above registry max", () => {
    expect(() =>
      searchRequestSchema.parse({
        workspaceId: "00000000-0000-4000-8000-000000000001",
        query: "grounded",
        limit: SEARCH_REGISTRY.maxLimit + 1,
      }),
    ).toThrow();
  });
});
