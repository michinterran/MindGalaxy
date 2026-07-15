import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ANALYSIS_QUEUE_REGISTRY,
  JOB_REGISTRY,
} from "@/config/registry";

type QueueTrigger = {
  type: string;
  topic: string;
  retryAfterSeconds: number;
  initialDelaySeconds: number;
  maxDeliveries?: number;
  maxConcurrency?: number;
};

type StaticVercelConfig = {
  functions: Record<
    string,
    {
      maxDuration: number;
      experimentalTriggers: QueueTrigger[];
    }
  >;
};

const config = JSON.parse(
  readFileSync(join(process.cwd(), "vercel.json"), "utf8"),
) as StaticVercelConfig;
const consumerRoute =
  "src/app/api/queues/analyze-capture/route.ts";
const consumerRoutePath = join(process.cwd(), consumerRoute);

describe("Vercel Queue trigger", () => {
  it("keeps the private push consumer aligned with the queue registry", () => {
    const consumer = config.functions[consumerRoute];

    expect(consumer).toMatchObject({
      maxDuration: 300,
      experimentalTriggers: [
        {
          type: "queue/v2beta",
          topic: ANALYSIS_QUEUE_REGISTRY.topic,
          retryAfterSeconds:
            JOB_REGISTRY.captureStructuring.retryBaseDelaySeconds,
          initialDelaySeconds: 0,
        },
      ],
    });
  });

  it("uses the official minimal v2 push schema for Git deployment compatibility", () => {
    const trigger = config.functions[consumerRoute].experimentalTriggers[0];

    expect(trigger).toEqual({
      type: "queue/v2beta",
      topic: ANALYSIS_QUEUE_REGISTRY.topic,
      retryAfterSeconds:
        JOB_REGISTRY.captureStructuring.retryBaseDelaySeconds,
      initialDelaySeconds: 0,
    });
    expect(trigger.maxDeliveries).toBeUndefined();
    expect(trigger.maxConcurrency).toBeUndefined();
  });

  it("keeps transport retries independent from database analysis attempts", () => {
    expect(ANALYSIS_QUEUE_REGISTRY.poisonDeliveryThreshold).toBeGreaterThan(
      JOB_REGISTRY.captureStructuring.maxAttempts,
    );
  });

  it("keeps the private callback route and timeout leases deployment-safe", () => {
    expect(existsSync(consumerRoutePath)).toBe(true);

    const routeSource = readFileSync(consumerRoutePath, "utf8");
    expect(routeSource).toContain(
      "export const POST = handleCallback<CaptureAnalysisEvent>",
    );
    expect(routeSource).not.toMatch(
      /export const (?:GET|PUT|PATCH|DELETE)\s*=/,
    );

    const maxDuration = config.functions[consumerRoute].maxDuration;
    expect(maxDuration).toBe(300);
    expect(JOB_REGISTRY.captureStructuring.leaseSeconds).toBeGreaterThan(
      maxDuration,
    );
    expect(ANALYSIS_QUEUE_REGISTRY.visibilityTimeoutSeconds).toBeGreaterThan(
      JOB_REGISTRY.captureStructuring.leaseSeconds,
    );
  });
});
