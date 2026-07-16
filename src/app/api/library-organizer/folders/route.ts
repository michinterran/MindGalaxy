import { NextResponse } from "next/server";
import { createOrganizerFolderSchema } from "@/features/library-organizer/model/requests";
import { organizerErrorResponse, organizerResponseHeaders } from "@/features/library-organizer/server/http";
import { createOrganizerFolder } from "@/features/library-organizer/server/service";
import { requireLibraryClients } from "@/features/library/server/http";
import { parseJsonRequest } from "@/lib/api/route-errors";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const clients = await requireLibraryClients();
    const input = createOrganizerFolderSchema.parse(await parseJsonRequest(request));
    const folder = await createOrganizerFolder(clients, input);
    return NextResponse.json({ folder }, { status: 201, headers: organizerResponseHeaders });
  } catch (error) {
    return organizerErrorResponse(error);
  }
}
