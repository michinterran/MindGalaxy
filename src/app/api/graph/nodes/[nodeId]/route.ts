import { NextResponse } from "next/server";
import {
  graphIdSchema,
  updateGraphNodeInputSchema,
} from "@/features/graph-mutations/model/schemas";
import {
  deleteGraphNodeRecord,
  updateGraphNodeRecord,
} from "@/features/graph-mutations/server/dal";
import {
  graphMutationErrorResponse,
  graphMutationResponseHeaders,
  requireGraphMutationClients,
} from "@/features/graph-mutations/server/http";
import { parseJsonRequest } from "@/lib/api/route-errors";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ nodeId: string }> },
) {
  try {
    const clients = await requireGraphMutationClients();
    const { nodeId: rawNodeId } = await params;
    const nodeId = graphIdSchema.parse(rawNodeId);
    const input = updateGraphNodeInputSchema.parse(await parseJsonRequest(request));
    const node = await updateGraphNodeRecord(clients, nodeId, input);

    return NextResponse.json(
      { node },
      { status: 200, headers: graphMutationResponseHeaders },
    );
  } catch (error) {
    return graphMutationErrorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ nodeId: string }> },
) {
  try {
    const clients = await requireGraphMutationClients();
    const { nodeId: rawNodeId } = await params;
    const nodeId = graphIdSchema.parse(rawNodeId);
    await deleteGraphNodeRecord(clients, nodeId);

    return new Response(null, {
      status: 204,
      headers: graphMutationResponseHeaders,
    });
  } catch (error) {
    return graphMutationErrorResponse(error);
  }
}
