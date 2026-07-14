import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { LIST_QUERY_LIMITS, PROCESSING_STATUS_VALUES } from "@/config/domain";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const processingJobListQuerySchema = z.object({
  workspaceId: z.uuid(),
  status: z.enum(PROCESSING_STATUS_VALUES).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(LIST_QUERY_LIMITS.maxLimit)
    .default(LIST_QUERY_LIMITS.defaultLimit),
});

function validationError(error: ZodError) {
  return NextResponse.json(
    {
      error: "VALIDATION_ERROR",
      details: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    },
    { status: 400 },
  );
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

  const parsed = processingJobListQuerySchema.safeParse({
    workspaceId: request.nextUrl.searchParams.get("workspaceId"),
    status: request.nextUrl.searchParams.get("status") ?? undefined,
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
  });

  if (!parsed.success) {
    return validationError(parsed.error);
  }

  const { workspaceId, status, limit } = parsed.data;
  let query = supabase
    .from("processing_jobs")
    .select(
      "id, workspace_id, capture_id, status, job_type, retry_count, error_message, created_at, updated_at",
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json(
      { error: "PROCESSING_JOB_LIST_FAILED" },
      { status: 500 },
    );
  }

  return NextResponse.json({ processingJobs: data ?? [] });
}
