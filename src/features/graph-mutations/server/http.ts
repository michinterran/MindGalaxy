import "server-only";

import { NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  GraphMutationError,
  type GraphMutationClients,
} from "@/features/graph-mutations/server/dal";
import {
  InvalidJsonRequestError,
  invalidJsonResponse,
  validationErrorResponse,
} from "@/lib/api/route-errors";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const NO_STORE_HEADERS = { "cache-control": "private, no-store" } as const;

export async function requireGraphMutationClients(): Promise<GraphMutationClients> {
  const actor = await createSupabaseServerClient();

  if (!actor) {
    throw new GraphMutationError("SUPABASE_NOT_CONFIGURED", 503);
  }

  const {
    data: { user },
    error,
  } = await actor.auth.getUser();

  if (error || !user) {
    throw new GraphMutationError("AUTH_REQUIRED", 401);
  }

  const service = getSupabaseServiceRoleClient();

  if (!service) {
    throw new GraphMutationError("SUPABASE_NOT_CONFIGURED", 503);
  }

  return { actor, service, userId: user.id };
}

export function graphMutationErrorResponse(error: unknown) {
  if (error instanceof InvalidJsonRequestError) {
    return invalidJsonResponse(NO_STORE_HEADERS);
  }

  if (error instanceof ZodError) {
    return validationErrorResponse(error, NO_STORE_HEADERS);
  }

  if (error instanceof GraphMutationError) {
    return NextResponse.json(
      { error: error.code },
      { status: error.status, headers: NO_STORE_HEADERS },
    );
  }

  console.error("[graph-mutation] unexpected failure", error);
  return NextResponse.json(
    { error: "GRAPH_MUTATION_FAILED" },
    { status: 500, headers: NO_STORE_HEADERS },
  );
}

export const graphMutationResponseHeaders = NO_STORE_HEADERS;
