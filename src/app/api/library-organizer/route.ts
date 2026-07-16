import { NextRequest, NextResponse } from "next/server";
import { organizerQuerySchema } from "@/features/library-organizer/model/requests";
import { organizerErrorResponse, organizerResponseHeaders } from "@/features/library-organizer/server/http";
import { loadOrganizerSnapshot } from "@/features/library-organizer/server/service";
import { requireLibraryClients } from "@/features/library/server/http";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const input = organizerQuerySchema.parse({
      workspaceId: request.nextUrl.searchParams.get("workspaceId"),
      from: request.nextUrl.searchParams.get("from"),
      toExclusive: request.nextUrl.searchParams.get("toExclusive"),
      folderId: request.nextUrl.searchParams.get("folderId") ?? undefined,
      topicId: request.nextUrl.searchParams.get("topicId") ?? undefined,
    });
    const clients = await requireLibraryClients();
    const snapshot = await loadOrganizerSnapshot(clients, input);
    return NextResponse.json(snapshot, { headers: organizerResponseHeaders });
  } catch (error) {
    return organizerErrorResponse(error);
  }
}
