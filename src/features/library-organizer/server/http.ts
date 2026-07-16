import "server-only";

import { NextResponse } from "next/server";
import { OrganizationError } from "@/features/library/server/organization";
import { sharedLibraryErrorResponse } from "@/features/library/server/http";

export const organizerResponseHeaders = { "cache-control": "private, no-store" } as const;

export function organizerErrorResponse(error: unknown) {
  const sharedResponse = sharedLibraryErrorResponse(error, organizerResponseHeaders);
  if (sharedResponse) return sharedResponse;
  if (error instanceof OrganizationError) {
    return NextResponse.json({ error: error.code }, { status: error.status, headers: organizerResponseHeaders });
  }
  console.error("[library-organizer] unexpected failure", error);
  return NextResponse.json(
    { error: "ORGANIZATION_READ_FAILED" },
    { status: 500, headers: organizerResponseHeaders },
  );
}
