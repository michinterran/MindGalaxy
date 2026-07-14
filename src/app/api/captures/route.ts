import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  captureListQuerySchema,
  createCaptureInputSchema,
} from "@/lib/captures/schema";
import { createCaptureWithProcessingJob } from "@/lib/captures/service";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
    const input = createCaptureInputSchema.parse(await request.json());
    const result = await createCaptureWithProcessingJob(
      supabase,
      input,
      user.id,
    );

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return validationError(error);
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
    return validationError(parsed.error);
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
