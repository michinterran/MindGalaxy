import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { workerAuthError } from "@/app/api/worker/analyze-captures/auth";
import { ANALYSIS_QUEUE_REGISTRY } from "@/config/registry";
import { drainAnalysisOutbox } from "@/features/analysis/queue/outbox";
import {
  InvalidJsonRequestError,
  invalidJsonResponse,
  parseOptionalJsonRequest,
} from "@/lib/api/route-errors";
import { getAnalysisWorkerEnv } from "@/lib/env";

export const runtime = "nodejs";
export const maxDuration = 60;

const requestSchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(ANALYSIS_QUEUE_REGISTRY.poisonDeliveryThreshold * 10)
    .default(10),
});

function bearerToken(request: NextRequest) {
  const [scheme, token] =
    (request.headers.get("authorization") ?? "").split(" ");
  return scheme?.toLowerCase() === "bearer" ? token : null;
}

export async function handleOutboxDrain(
  request: NextRequest,
  drain = drainAnalysisOutbox,
) {
  const authError = workerAuthError(
    getAnalysisWorkerEnv(),
    bearerToken(request),
  );

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
    return NextResponse.json(await drain(parsed.data.limit));
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "ANALYSIS_OUTBOX_NOT_CONFIGURED"
    ) {
      return NextResponse.json(
        { error: "WORKER_NOT_CONFIGURED" },
        { status: 503 },
      );
    }

    return NextResponse.json(
      { error: "ANALYSIS_OUTBOX_DRAIN_FAILED" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  return handleOutboxDrain(request);
}
