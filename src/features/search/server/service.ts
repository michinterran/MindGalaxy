import "server-only";

import { zodTextFormat } from "openai/helpers/zod";
import type OpenAI from "openai";
import { SEARCH_REGISTRY } from "@/config/registry";
import {
  fallbackGroundedAnswer,
  validateGroundedAnswer,
} from "@/features/search/model/grounding";
import {
  groundedAnswerSchema,
  type GroundedAnswer,
  type SearchRequest,
  type SearchResult,
} from "@/features/search/model/schemas";
import { mapSearchRows } from "@/features/search/model/scoring";
import { t, type Locale } from "@/lib/i18n";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export function toVectorLiteral(embedding: number[]) {
  if (embedding.length !== SEARCH_REGISTRY.embedding.dimensions) {
    throw new Error("QUERY_EMBEDDING_DIMENSION_MISMATCH");
  }

  return `[${embedding.join(",")}]`;
}

export async function embedSearchQuery(openai: OpenAI, query: string) {
  const response = await openai.embeddings.create({
    model: SEARCH_REGISTRY.embedding.model,
    dimensions: SEARCH_REGISTRY.embedding.dimensions,
    input: query.slice(0, SEARCH_REGISTRY.embeddingInputMaxChars),
  });

  const embedding = response.data[0]?.embedding;

  if (!embedding || embedding.length !== SEARCH_REGISTRY.embedding.dimensions) {
    throw new Error("QUERY_EMBEDDING_FAILED");
  }

  return embedding;
}

export async function searchWorkspaceKnowledge(
  supabase: SupabaseClient<Database>,
  request: SearchRequest,
  queryEmbedding: number[],
): Promise<SearchResult[]> {
  const { data, error } = await supabase.rpc("search_workspace_knowledge", {
    p_workspace_id: request.workspaceId,
    p_query: request.query,
    p_query_embedding: toVectorLiteral(queryEmbedding),
    p_limit: request.limit,
  });

  if (error) {
    throw new Error("SEARCH_RPC_FAILED");
  }

  return mapSearchRows(data, request.locale);
}

function answerInput(query: string, results: SearchResult[], locale: Locale) {
  return JSON.stringify({
    query,
    locale,
    responseLanguage: t(locale, "app.locale"),
    results: results.map((result) => ({
      resultId: result.resultId,
      title: result.title,
      sourceType: result.sourceType,
      snippet: result.snippet,
      evidence: result.evidence,
    })),
  });
}

export async function generateGroundedAnswer(
  openai: OpenAI,
  query: string,
  results: SearchResult[],
  locale: Locale,
): Promise<GroundedAnswer> {
  const topResults = results.slice(0, SEARCH_REGISTRY.answer.maxContextResults);

  if (!topResults.length) {
    return fallbackGroundedAnswer(locale);
  }

  const response = await openai.responses.parse({
    model: SEARCH_REGISTRY.answer.model,
    input: [
      {
        role: "system",
        content:
          `Answer only from the provided bounded search results. Respond in ${t(locale, "app.locale")}. Cite resultId and an exact quote from snippet or evidence. If evidence is insufficient, set grounded=false and confidence low.`,
      },
      {
        role: "user",
        content: answerInput(query, topResults, locale),
      },
    ],
    text: {
      format: zodTextFormat(groundedAnswerSchema, "grounded_search_answer"),
    },
  });

  if (!response.output_parsed) {
    return fallbackGroundedAnswer(locale);
  }

  return validateGroundedAnswer(response.output_parsed, topResults, locale);
}
