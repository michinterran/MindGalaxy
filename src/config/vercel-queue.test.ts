import { describe, expect, it } from "vitest";
import {
  ANALYSIS_QUEUE_REGISTRY,
  JOB_REGISTRY,
} from "@/config/registry";
import { config } from "../../vercel";

describe("Vercel Queue trigger", () => {
  it("keeps the private push consumer aligned with the queue registry", () => {
    const consumer =
      config.functions?.["src/app/api/queues/analyze-capture/route.ts"];

    expect(consumer).toMatchObject({
      maxDuration: 300,
      experimentalTriggers: [
        {
          type: "queue/v2beta",
          topic: ANALYSIS_QUEUE_REGISTRY.topic,
          maxDeliveries: ANALYSIS_QUEUE_REGISTRY.maxDeliveries,
          maxConcurrency: ANALYSIS_QUEUE_REGISTRY.maxConcurrency,
        },
      ],
    });
  });

  it("keeps transport retries independent from database analysis attempts", () => {
    expect(ANALYSIS_QUEUE_REGISTRY.maxDeliveries).toBeGreaterThan(
      JOB_REGISTRY.captureStructuring.maxAttempts,
    );
  });
});
