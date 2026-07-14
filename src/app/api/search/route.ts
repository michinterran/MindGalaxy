import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { searchRequestSchema } from "@/features/search/model/schemas";
import {
  embedSearchQuery,
  generateGroundedAnswer,
  searchWorkspaceKnowledge,
} from "@/features/search/server/service";
import { getOpenAIClient } from "@/lib/ai/client";
import {
  InvalidJsonRequestError,
  invalidJsonResponse,
  parseJsonRequest,
  validationErrorResponse,
} from "@/lib/api/route-errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return NextResponse.json(
      { error: "SUPABASE_NOT_CONFIGURED" },
      { status: 503 },
    );
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });
  }

  const openai = getOpenAIClient();

  if (!openai) {
    return NextResponse.json(
      { error: "OPENAI_NOT_CONFIGURED" },
      { status: 503 },
    );
  }

  try {
    const input = searchRequestSchema.parse(await parseJsonRequest(request));
    const queryEmbedding = await embedSearchQuery(openai, input.query);
    const results = await searchWorkspaceKnowledge(supabase, input, queryEmbedding);
    const answer = await generateGroundedAnswer(openai, input.query, results, input.locale);

    return NextResponse.json({
      query: input.query,
      workspaceId: input.workspaceId,
      results,
      answer,
    });
  } catch (error) {
    if (error instanceof InvalidJsonRequestError) {
      return invalidJsonResponse();
    }

    if (error instanceof ZodError) {
      return validationErrorResponse(error);
    }

    return NextResponse.json({ error: "SEARCH_FAILED" }, { status: 500 });
  }
}
