import { NextResponse } from "next/server";
import { createGraphEdgeInputSchema } from "@/features/graph-mutations/model/schemas";
import { createGraphEdgeRecord } from "@/features/graph-mutations/server/dal";
import {
  graphMutationErrorResponse,
  graphMutationResponseHeaders,
  requireGraphMutationClients,
} from "@/features/graph-mutations/server/http";
import { parseJsonRequest } from "@/lib/api/route-errors";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const clients = await requireGraphMutationClients();
    const input = createGraphEdgeInputSchema.parse(await parseJsonRequest(request));
    const edge = await createGraphEdgeRecord(clients, input);

    return NextResponse.json(
      { edge },
      { status: 201, headers: graphMutationResponseHeaders },
    );
  } catch (error) {
    return graphMutationErrorResponse(error);
  }
}
