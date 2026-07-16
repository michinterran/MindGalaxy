import OpenAI from "openai";
import { describe, expect, it, vi } from "vitest";
import { SEARCH_REGISTRY } from "@/config/registry";
import { embedCaptureAnalysis } from "@/features/analysis/worker/embeddings";
import type { ClaimedAnalysisJob } from "@/features/analysis/worker/claim";

vi.mock("server-only", () => ({}));

const job: ClaimedAnalysisJob = {
  jobId: "11111111-1111-4111-8111-111111111111",
  attemptId: "22222222-2222-4222-8222-222222222222",
  attemptNumber: 1,
  workspaceId: "33333333-3333-4333-8333-333333333333",
  captureId: "44444444-4444-4444-8444-444444444444",
  rawText: "AI 답변을 지식으로 보존한다.",
  sourceKind: "paste",
  title: null,
  model: "gpt-5-mini",
  promptVersion: "test-prompt",
};

const analysis = {
  captureSummary: null,
  language: "ko" as const,
  contexts: [],
  nodes: [
    {
      clientNodeId: "node-1",
      kind: "idea" as const,
      title: "AI 답변 보존",
      summary: null,
      evidence: null,
      confidence: 0.9,
      contextClientIds: [],
    },
  ],
  edges: [],
};

describe("embedCaptureAnalysis", () => {
  it("uses a bounded request and returns normalized embedding usage", async () => {
    const vector = Array.from(
      { length: SEARCH_REGISTRY.embedding.dimensions },
      () => 0.1,
    );
    const create = vi.fn().mockResolvedValue({
      data: [
        { index: 0, embedding: vector },
        { index: 1, embedding: vector },
      ],
      model: "text-embedding-3-small",
      object: "list",
      usage: {
        prompt_tokens: 42,
        total_tokens: 42,
      },
    });
    const openai = {
      embeddings: { create },
    } as unknown as OpenAI;

    const result = await embedCaptureAnalysis(openai, job, analysis);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: SEARCH_REGISTRY.embedding.model,
        dimensions: SEARCH_REGISTRY.embedding.dimensions,
      }),
      {
        timeout: SEARCH_REGISTRY.embedding.timeoutMs,
        maxRetries: SEARCH_REGISTRY.embedding.maxRetries,
      },
    );
    expect(result.analysis.captureEmbedding).toHaveLength(
      SEARCH_REGISTRY.embedding.dimensions,
    );
    expect(result.analysis.nodes[0]?.embedding).toHaveLength(
      SEARCH_REGISTRY.embedding.dimensions,
    );
    expect(result.usage).toEqual({
      model: "text-embedding-3-small",
      embeddingTokens: 42,
      totalTokens: 42,
    });
  });
});
