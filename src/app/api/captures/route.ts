import { after, NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { logAnalysisEvent } from "@/features/analysis/observability";
import { drainAnalysisOutboxForJob } from "@/features/analysis/queue/outbox";
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
    after(async () => {
      try {
        await drainAnalysisOutboxForJob(result.processingJob.id);
      } catch {
        logAnalysisEvent("warn", {
          event: "outbox.drain_deferred",
          stage: "after",
          jobId: result.processingJob.id,
          captureId: result.capture.id,
          workspaceId: result.capture.workspace_id,
          errorCode: "ANALYSIS_OUTBOX_DRAIN_FAILED",
          outcome: "pending",
        });
      }
    });

    return NextResponse.json(
      {
        ...result,
        analysisDispatch: "outbox",
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
