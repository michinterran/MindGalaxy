import { NextResponse } from "next/server";
import { libraryIdSchema, updateCaptureTitleInputSchema } from "@/features/library/model/schemas";
import {
  deleteCaptureRecord,
  getCaptureDetailRecord,
  updateCaptureTitleRecord,
} from "@/features/library/server/dal";
import {
  libraryErrorResponse,
  libraryResponseHeaders,
  requireLibraryClients,
} from "@/features/library/server/http";
import { parseJsonRequest } from "@/lib/api/route-errors";

export const runtime = "nodejs";

type Context = { params: Promise<{ captureId: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const clients = await requireLibraryClients();
    const { captureId: rawCaptureId } = await params;
    const capture = await getCaptureDetailRecord(
      clients,
      libraryIdSchema.parse(rawCaptureId),
    );
    return NextResponse.json({ capture }, { headers: libraryResponseHeaders });
  } catch (error) {
    return libraryErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const clients = await requireLibraryClients();
    const { captureId: rawCaptureId } = await params;
    const input = updateCaptureTitleInputSchema.parse(await parseJsonRequest(request));
    const capture = await updateCaptureTitleRecord(
      clients,
      libraryIdSchema.parse(rawCaptureId),
      input,
    );
    return NextResponse.json({ capture }, { headers: libraryResponseHeaders });
  } catch (error) {
    return libraryErrorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const clients = await requireLibraryClients();
    const { captureId: rawCaptureId } = await params;
    const result = await deleteCaptureRecord(
      clients,
      libraryIdSchema.parse(rawCaptureId),
    );
    return NextResponse.json(result, { headers: libraryResponseHeaders });
  } catch (error) {
    return libraryErrorResponse(error);
  }
}
