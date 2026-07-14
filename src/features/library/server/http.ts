import "server-only";

import { NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  LibraryError,
  type LibraryClients,
} from "@/features/library/server/dal";
import {
  InvalidJsonRequestError,
  invalidJsonResponse,
  validationErrorResponse,
} from "@/lib/api/route-errors";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const libraryResponseHeaders = {
  "cache-control": "private, no-store",
} as const;

export async function requireLibraryClients(): Promise<LibraryClients> {
  const actor = await createSupabaseServerClient();
  if (!actor) throw new LibraryError("SUPABASE_NOT_CONFIGURED", 503);
  const {
    data: { user },
    error,
  } = await actor.auth.getUser();
  if (error || !user) throw new LibraryError("AUTH_REQUIRED", 401);
  const service = getSupabaseServiceRoleClient();
  if (!service) throw new LibraryError("SUPABASE_NOT_CONFIGURED", 503);
  return { actor, service, userId: user.id };
}

export function libraryErrorResponse(error: unknown) {
  if (error instanceof InvalidJsonRequestError) {
    return invalidJsonResponse(libraryResponseHeaders);
  }
  if (error instanceof ZodError) {
    return validationErrorResponse(error, libraryResponseHeaders);
  }
  if (error instanceof LibraryError) {
    return NextResponse.json(
      { error: error.code },
      { status: error.status, headers: libraryResponseHeaders },
    );
  }
  console.error("[library] unexpected failure", error);
  return NextResponse.json(
    { error: "CAPTURE_READ_FAILED" },
    { status: 500, headers: libraryResponseHeaders },
  );
}
