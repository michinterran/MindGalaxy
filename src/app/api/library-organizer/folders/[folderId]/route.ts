import { NextResponse } from "next/server";
import { updateOrganizerFolderSchema } from "@/features/library-organizer/model/requests";
import { organizerErrorResponse, organizerResponseHeaders } from "@/features/library-organizer/server/http";
import { deleteOrganizerFolder, renameOrganizerFolder } from "@/features/library-organizer/server/service";
import { libraryIdSchema } from "@/features/library/model/schemas";
import { requireLibraryClients } from "@/features/library/server/http";
import { parseJsonRequest } from "@/lib/api/route-errors";

export const runtime = "nodejs";
type Context = { params: Promise<{ folderId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  try {
    const clients = await requireLibraryClients();
    const { folderId: rawFolderId } = await params;
    const folderId = libraryIdSchema.parse(rawFolderId);
    const input = updateOrganizerFolderSchema.parse(await parseJsonRequest(request));
    const folder = await renameOrganizerFolder(clients, folderId, input.name);
    return NextResponse.json({ folder }, { headers: organizerResponseHeaders });
  } catch (error) {
    return organizerErrorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const clients = await requireLibraryClients();
    const { folderId: rawFolderId } = await params;
    const folderId = libraryIdSchema.parse(rawFolderId);
    await deleteOrganizerFolder(clients, folderId);
    return NextResponse.json({ folderId }, { headers: organizerResponseHeaders });
  } catch (error) {
    return organizerErrorResponse(error);
  }
}
