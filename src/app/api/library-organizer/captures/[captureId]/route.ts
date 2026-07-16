import { NextResponse } from "next/server";
import { updateCaptureOrganizationSchema } from "@/features/library-organizer/model/requests";
import { organizerErrorResponse, organizerResponseHeaders } from "@/features/library-organizer/server/http";
import { updateCaptureOrganization } from "@/features/library-organizer/server/service";
import { libraryIdSchema } from "@/features/library/model/schemas";
import { requireLibraryClients } from "@/features/library/server/http";
import { parseJsonRequest } from "@/lib/api/route-errors";

export const runtime = "nodejs";
type Context = { params: Promise<{ captureId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  try {
    const clients = await requireLibraryClients();
    const { captureId: rawCaptureId } = await params;
    const captureId = libraryIdSchema.parse(rawCaptureId);
    const input = updateCaptureOrganizationSchema.parse(await parseJsonRequest(request));
    const result = await updateCaptureOrganization(clients, captureId, input);
    return NextResponse.json(result, { headers: organizerResponseHeaders });
  } catch (error) {
    return organizerErrorResponse(error);
  }
}
