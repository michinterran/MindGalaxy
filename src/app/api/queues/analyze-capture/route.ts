import { handleCallback } from "@vercel/queue";
import { ANALYSIS_QUEUE_REGISTRY } from "@/config/registry";
import {
  captureAnalysisRetry,
  consumeCaptureAnalysisEvent,
} from "@/features/analysis/queue/consumer";
import type { CaptureAnalysisEvent } from "@/features/analysis/queue/contracts";

export const runtime = "nodejs";
export const maxDuration = 300;

export const POST = handleCallback<CaptureAnalysisEvent>(
  consumeCaptureAnalysisEvent,
  {
    visibilityTimeoutSeconds:
      ANALYSIS_QUEUE_REGISTRY.visibilityTimeoutSeconds,
    retry: captureAnalysisRetry,
  },
);
