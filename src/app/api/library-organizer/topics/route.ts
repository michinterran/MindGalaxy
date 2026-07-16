import { NextResponse } from "next/server";
import { createOrganizerTopicSchema } from "@/features/library-organizer/model/requests";
import { organizerErrorResponse, organizerResponseHeaders } from "@/features/library-organizer/server/http";
import { createOrganizerTopic } from "@/features/library-organizer/server/service";
import { requireLibraryClients } from "@/features/library/server/http";
import { parseJsonRequest } from "@/lib/api/route-errors";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const clients = await requireLibraryClients();
    const input = createOrganizerTopicSchema.parse(await parseJsonRequest(request));
    const topic = await createOrganizerTopic(clients, input);
    return NextResponse.json(
      { topic: { id: topic.id, label: topic.label, captureCount: 0 } },
      { status: 201, headers: organizerResponseHeaders },
    );
  } catch (error) {
    return organizerErrorResponse(error);
  }
}
