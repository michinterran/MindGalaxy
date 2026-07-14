import { graphIdSchema } from "@/features/graph-mutations/model/schemas";
import { deleteGraphEdgeRecord } from "@/features/graph-mutations/server/dal";
import {
  graphMutationErrorResponse,
  graphMutationResponseHeaders,
  requireGraphMutationClients,
} from "@/features/graph-mutations/server/http";

export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ edgeId: string }> },
) {
  try {
    const clients = await requireGraphMutationClients();
    const { edgeId: rawEdgeId } = await params;
    const edgeId = graphIdSchema.parse(rawEdgeId);
    await deleteGraphEdgeRecord(clients, edgeId);

    return new Response(null, {
      status: 204,
      headers: graphMutationResponseHeaders,
    });
  } catch (error) {
    return graphMutationErrorResponse(error);
  }
}
