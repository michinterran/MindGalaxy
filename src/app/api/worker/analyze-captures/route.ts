import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { workerAuthError } from "@/app/api/worker/analyze-captures/auth";
import { JOB_REGISTRY } from "@/config/registry";
import { runCaptureAnalysisBatch } from "@/features/analysis/worker/run-capture-analysis";
import {
  InvalidJsonRequestError,
  invalidJsonResponse,
  parseOptionalJsonRequest,
} from "@/lib/api/route-errors";
import { getAnalysisWorkerEnv } from "@/lib/env";

export const runtime = "nodejs";

const requestSchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(JOB_REGISTRY.captureStructuring.maxBatchSize)
    .default(1),
});

function getBearerToken(request: NextRequest) {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");

  return scheme?.toLowerCase() === "bearer" ? token : null;
}

export async function POST(request: NextRequest) {
  const env = getAnalysisWorkerEnv();
  const token = getBearerToken(request);
  const authError = workerAuthError(env, token);

  if (authError) {
    return NextResponse.json(
      { error: authError.error },
      { status: authError.status },
    );
  }

  let body: unknown = {};

  try {
    body = await parseOptionalJsonRequest(request);
  } catch (error) {
    if (error instanceof InvalidJsonRequestError) {
      return invalidJsonResponse();
    }

    throw error;
  }

  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
  }

  try {
    const result = await runCaptureAnalysisBatch(parsed.data.limit);

    return NextResponse.json(result);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "ANALYSIS_WORKER_NOT_CONFIGURED"
    ) {
      return NextResponse.json(
        { error: "WORKER_NOT_CONFIGURED" },
        { status: 503 },
      );
    }

    return NextResponse.json(
      { error: "ANALYSIS_WORKER_FAILED" },
      { status: 500 },
    );
  }
}
