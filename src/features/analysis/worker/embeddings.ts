import "server-only";

import OpenAI from "openai";
import { SEARCH_REGISTRY } from "@/config/registry";
import type { CaptureAnalysisOutput } from "@/features/analysis/model/extraction-schema";
import type { ClaimedAnalysisJob } from "@/features/analysis/worker/claim";

export type EmbeddingVector = number[];

export type PersistedAnalysisNode = CaptureAnalysisOutput["nodes"][number] & {
  embedding: EmbeddingVector;
};

export type PersistedCaptureAnalysis = Omit<CaptureAnalysisOutput, "nodes"> & {
  captureEmbedding: EmbeddingVector;
  nodes: PersistedAnalysisNode[];
};

export type EmbeddedCaptureAnalysisResult = {
  analysis: PersistedCaptureAnalysis;
  usage: {
    model: string;
    embeddingTokens: number;
    totalTokens: number;
  };
};

function boundedEmbeddingInput(value: string) {
  return value.slice(0, SEARCH_REGISTRY.embeddingInputMaxChars);
}

function assertEmbeddingDimensions(embedding: number[]) {
  if (embedding.length !== SEARCH_REGISTRY.embedding.dimensions) {
    throw new Error("EMBEDDING_DIMENSION_MISMATCH");
  }

  return embedding;
}

function nodeSearchText(node: CaptureAnalysisOutput["nodes"][number]) {
  return boundedEmbeddingInput(
    [node.title, node.summary, node.evidence?.quote]
      .filter(Boolean)
      .join("\n"),
  );
}

function captureSearchText(job: ClaimedAnalysisJob) {
  return boundedEmbeddingInput([job.title, job.rawText].filter(Boolean).join("\n"));
}

export async function embedCaptureAnalysis(
  openai: OpenAI,
  job: ClaimedAnalysisJob,
  analysis: CaptureAnalysisOutput,
): Promise<EmbeddedCaptureAnalysisResult> {
  const inputs = [
    captureSearchText(job),
    ...analysis.nodes.map((node) => nodeSearchText(node)),
  ];

  const response = await openai.embeddings.create(
    {
      model: SEARCH_REGISTRY.embedding.model,
      dimensions: SEARCH_REGISTRY.embedding.dimensions,
      input: inputs,
    },
    {
      timeout: SEARCH_REGISTRY.embedding.timeoutMs,
      maxRetries: SEARCH_REGISTRY.embedding.maxRetries,
    },
  );

  const embeddings = response.data
    .sort((left, right) => left.index - right.index)
    .map((item) => assertEmbeddingDimensions(item.embedding));

  const [captureEmbedding, ...nodeEmbeddings] = embeddings;

  if (!captureEmbedding || nodeEmbeddings.length !== analysis.nodes.length) {
    throw new Error("EMBEDDING_RESPONSE_MISMATCH");
  }

  return {
    analysis: {
      ...analysis,
      captureEmbedding,
      nodes: analysis.nodes.map((node, index) => ({
        ...node,
        embedding: nodeEmbeddings[index] ?? [],
      })),
    },
    usage: {
      model: response.model,
      embeddingTokens: response.usage.prompt_tokens,
      totalTokens: response.usage.total_tokens,
    },
  };
}
