import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  InvalidJsonRequestError,
  invalidJsonResponse,
  parseJsonRequest,
  parseOptionalJsonRequest,
} from "@/lib/api/route-errors";

describe("route JSON parsing", () => {
  it("maps malformed JSON to INVALID_JSON", async () => {
    const request = new Request("https://mindgalaxy.test/api", {
      body: "{bad json",
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    await expect(parseJsonRequest(request)).rejects.toBeInstanceOf(
      InvalidJsonRequestError,
    );

    const response = invalidJsonResponse();
    await expect(response.json()).resolves.toEqual({ error: "INVALID_JSON" });
    expect(response.status).toBe(400);
  });

  it("allows optional JSON bodies for worker-style default requests", async () => {
    const request = new Request("https://mindgalaxy.test/api", {
      method: "POST",
    });

    await expect(parseOptionalJsonRequest(request)).resolves.toEqual({});
  });
});

describe("mutation route invalid JSON wiring", () => {
  it.each([
    "src/app/api/captures/route.ts",
    "src/app/api/search/route.ts",
    "src/app/api/exports/route.ts",
  ])("%s uses the shared INVALID_JSON response", (file) => {
    const source = readFileSync(join(process.cwd(), file), "utf8");

    expect(source).toContain("parseJsonRequest");
    expect(source).toContain("invalidJsonResponse");
    expect(source).toContain("InvalidJsonRequestError");
  });
});
