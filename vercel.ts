import type { VercelConfig } from "@vercel/config/v1";
import { ANALYSIS_QUEUE_REGISTRY } from "./src/config/registry";

export const config: VercelConfig = {
  framework: "nextjs",
  functions: {
    "src/app/api/queues/analyze-capture/route.ts": {
      maxDuration: 300,
      experimentalTriggers: [
        {
          type: "queue/v2beta",
          topic: ANALYSIS_QUEUE_REGISTRY.topic,
          maxDeliveries: ANALYSIS_QUEUE_REGISTRY.maxDeliveries,
          retryAfterSeconds: 60,
          initialDelaySeconds: 0,
          maxConcurrency: ANALYSIS_QUEUE_REGISTRY.maxConcurrency,
        },
      ],
    },
  },
};
