import { NextRequest, NextResponse } from "next/server";
import {
  createWorkspaceExport,
  ExportServiceError,
} from "@/features/export/server/service";
import {
  InvalidJsonRequestError,
  invalidJsonResponse,
  parseJsonRequest,
} from "@/lib/api/route-errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return NextResponse.json(
      { error: "SUPABASE_NOT_CONFIGURED" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json(
      { error: "AUTH_REQUIRED" },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }

  try {
    const input = await parseJsonRequest(request);
    const result = await createWorkspaceExport({
      input,
      supabase,
      user,
    });

    return new Response(Buffer.from(result.bytes), {
      headers: {
        "cache-control": "no-store",
        "content-disposition": result.contentDisposition,
        "content-length": String(result.bytes.byteLength),
        "content-type": result.mimeType,
        "x-content-type-options": "nosniff",
      },
      status: 200,
    });
  } catch (error) {
    if (error instanceof InvalidJsonRequestError) {
      return invalidJsonResponse({ "cache-control": "no-store" });
    }

    if (error instanceof ExportServiceError) {
      const payload =
        error.code === "VALIDATION_ERROR"
          ? { error: error.code, details: error.details }
          : { error: error.code };

      return NextResponse.json(
        payload,
        { status: error.status, headers: { "cache-control": "no-store" } },
      );
    }

    return NextResponse.json(
      { error: "EXPORT_FAILED" },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}
