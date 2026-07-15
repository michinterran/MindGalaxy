import { describe, expect, it, vi } from "vitest";
import type { ScoredAnalysis } from "@/features/analysis/model/scoring";
import type { ClaimedAnalysisJob } from "@/features/analysis/worker/claim";
import type { PersistedCaptureAnalysis } from "@/features/analysis/worker/embeddings";
import {
  normalizeAnalysisResultForPersistence,
  persistAnalysisResult,
} from "@/features/analysis/worker/persist-analysis";
import type { Database } from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";

const analysis: PersistedCaptureAnalysis = {
  captureSummary: null,
  language: "ko",
  captureEmbedding: [0.1, 0.2],
  contexts: [
    {
      clientContextId: "context-1",
      kind: "topic",
      label: "MindGalaxy",
      normalizedValue: null,
      evidence: null,
      confidence: 0.8,
    },
  ],
  nodes: [
    {
      clientNodeId: "node-1",
      kind: "idea",
      title: "AI 답변 보존",
      summary: null,
      evidence: null,
      confidence: 0.8,
      contextClientIds: ["context-1"],
      embedding: [0.3, 0.4],
    },
  ],
  edges: [
    {
      sourceClientNodeId: "node-1",
      targetClientNodeId: "node-1",
      kind: "relates_to",
      label: null,
      evidence: null,
      confidence: 0.7,
    },
  ],
};

const job: ClaimedAnalysisJob = {
  jobId: "11111111-1111-4111-8111-111111111111",
  attemptId: "22222222-2222-4222-8222-222222222222",
  attemptNumber: 1,
  workspaceId: "33333333-3333-4333-8333-333333333333",
  captureId: "44444444-4444-4444-8444-444444444444",
  rawText: "AI 답변 보존",
  sourceKind: "paste",
  title: null,
  model: "test-model",
  promptVersion: "test-prompt",
};

const score: ScoredAnalysis = {
  confidence: 0.8,
  reviewRequired: true,
  reviewReasons: ["MISSING_EVIDENCE"],
};

function mockSupabase(result: { data: unknown; error: { message: string } | null }) {
  const single = vi.fn().mockResolvedValue(result);
  const rpc = vi.fn().mockReturnValue({ single });

  return {
    client: { rpc } as unknown as SupabaseClient<Database>,
    rpc,
  };
}

describe("analysis result persistence", () => {
  it("normalizes nullable evidence to JSON objects without mutating the analysis", () => {
    const normalized = normalizeAnalysisResultForPersistence(analysis) as {
      contexts: Array<{ evidence: unknown }>;
      nodes: Array<{ evidence: unknown }>;
      edges: Array<{ evidence: unknown }>;
    };

    expect(normalized.contexts[0]?.evidence).toEqual({});
    expect(normalized.nodes[0]?.evidence).toEqual({});
    expect(normalized.edges[0]?.evidence).toEqual({});
    expect(analysis.contexts[0]?.evidence).toBeNull();
    expect(analysis.nodes[0]?.evidence).toBeNull();
    expect(analysis.edges[0]?.evidence).toBeNull();
  });

  it("preserves grounded evidence objects", () => {
    const normalized = normalizeAnalysisResultForPersistence({
      ...analysis,
      nodes: [
        {
          ...analysis.nodes[0]!,
          evidence: { quote: "AI 답변 보존" },
        },
      ],
    }) as { nodes: Array<{ evidence: unknown }> };

    expect(normalized.nodes[0]?.evidence).toEqual({ quote: "AI 답변 보존" });
  });

  it("sends the normalized result to the persistence RPC", async () => {
    const { client, rpc } = mockSupabase({
      data: { status: "needs_review" },
      error: null,
    });

    await persistAnalysisResult(client, job, "worker-1", analysis, score);

    expect(rpc).toHaveBeenCalledWith(
      "persist_capture_analysis_result",
      expect.objectContaining({
        p_result: expect.objectContaining({
          contexts: [expect.objectContaining({ evidence: {} })],
          nodes: [expect.objectContaining({ evidence: {} })],
          edges: [expect.objectContaining({ evidence: {} })],
        }),
      }),
    );
  });

  it("keeps known RPC validation codes while hiding unexpected database details", async () => {
    const known = mockSupabase({
      data: null,
      error: { message: "NODE_JSON_SHAPE_INVALID" },
    });
    const unexpected = mockSupabase({
      data: null,
      error: { message: "connection detail that must not escape" },
    });

    await expect(
      persistAnalysisResult(known.client, job, "worker-1", analysis, score),
    ).rejects.toThrow("NODE_JSON_SHAPE_INVALID");
    await expect(
      persistAnalysisResult(unexpected.client, job, "worker-1", analysis, score),
    ).rejects.toThrow("ANALYSIS_RESULT_PERSIST_FAILED");
  });
});
