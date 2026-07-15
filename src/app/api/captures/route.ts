import { after, NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { ANALYSIS_QUEUE_REGISTRY } from "@/config/registry";
import { logAnalysisEvent } from "@/features/analysis/observability";
import { dispatchCaptureAnalysis } from "@/features/analysis/queue/dispatch";
import { runCaptureAnalysisJob } from "@/features/analysis/worker/run-capture-analysis";
import {
  InvalidJsonRequestError,
  invalidJsonResponse,
  parseJsonRequest,
  validationErrorResponse,
} from "@/lib/api/route-errors";
import {
  captureListQuerySchema,
  createCaptureInputSchema,
} from "@/lib/captures/schema";
import { createCaptureWithProcessingJob } from "@/lib/captures/service";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return NextResponse.json(
      { error: "SUPABASE_NOT_CONFIGURED" },
      { status: 503 },
    );
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });
  }

  try {
    const input = createCaptureInputSchema.parse(await parseJsonRequest(request));
    const result = await createCaptureWithProcessingJob(supabase, input);
    const dispatch = await dispatchCaptureAnalysis({
      schemaVersion: ANALYSIS_QUEUE_REGISTRY.schemaVersion,
      eventType: ANALYSIS_QUEUE_REGISTRY.eventType,
      processingJobId: result.processingJob.id,
      captureId: result.capture.id,
      workspaceId: result.capture.workspace_id,
      createdAt: result.processingJob.created_at,
    });

    if (dispatch.transport === "fallback") {
      after(async () => {
        const startedAt = performance.now();

        try {
          const batch = await runCaptureAnalysisJob(result.processingJob.id, {
            expectedCaptureId: result.capture.id,
            expectedWorkspaceId: result.capture.workspace_id,
          });
          logAnalysisEvent("info", {
            event: "fallback.completed",
            stage: "after",
            jobId: result.processingJob.id,
            captureId: result.capture.id,
            workspaceId: result.capture.workspace_id,
            durationMs: Math.round(performance.now() - startedAt),
            outcome:
              batch.disposition === "terminal"
                ? "idempotent_terminal"
                : batch.disposition,
          });
        } catch {
          logAnalysisEvent("error", {
            event: "fallback.failed",
            stage: "after",
            jobId: result.processingJob.id,
            captureId: result.capture.id,
            workspaceId: result.capture.workspace_id,
            durationMs: Math.round(performance.now() - startedAt),
            errorCode: "ANALYSIS_FALLBACK_FAILED",
            outcome: "failed",
          });
        }
      });
    }

    return NextResponse.json(
      {
        ...result,
        analysisDispatch: dispatch.transport,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof InvalidJsonRequestError) {
      return invalidJsonResponse();
    }

    if (error instanceof ZodError) {
      return validationErrorResponse(error);
    }

    return NextResponse.json(
      { error: "CAPTURE_CREATE_FAILED" },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return NextResponse.json(
      { error: "SUPABASE_NOT_CONFIGURED" },
      { status: 503 },
    );
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });
  }

  const parsed = captureListQuerySchema.safeParse({
    workspaceId: request.nextUrl.searchParams.get("workspaceId"),
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
  });

  if (!parsed.success) {
    return validationErrorResponse(parsed.error);
  }

  const { workspaceId, limit } = parsed.data;
  const { data, error } = await supabase
    .from("captures")
    .select("id, workspace_id, project_id, title, source_kind, created_at, updated_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: "CAPTURE_LIST_FAILED" }, { status: 500 });
  }

  return NextResponse.json({ captures: data ?? [] });
}
