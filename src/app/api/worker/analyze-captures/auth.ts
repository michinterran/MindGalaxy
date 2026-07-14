import { createHash, timingSafeEqual } from "node:crypto";
import type { AnalysisWorkerEnv } from "@/lib/env";

function safeEqual(left: string, right: string) {
  const leftDigest = createHash("sha256").update(left).digest();
  const rightDigest = createHash("sha256").update(right).digest();

  return timingSafeEqual(leftDigest, rightDigest);
}

export function workerAuthError(
  env: AnalysisWorkerEnv | null,
  token: string | null,
) {
  if (!env) {
    return { error: "WORKER_NOT_CONFIGURED", status: 503 } as const;
  }

  if (!token || !safeEqual(token, env.ANALYSIS_WORKER_SECRET)) {
    return { error: "WORKER_UNAUTHORIZED", status: 401 } as const;
  }

  return null;
}
