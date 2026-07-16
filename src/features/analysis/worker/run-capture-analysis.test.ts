import { beforeEach, describe, expect, it, vi } from "vitest";
import { JOB_REGISTRY } from "@/config/registry";
import { runCaptureAnalysisJob } from "@/features/analysis/worker/run-capture-analysis";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  claimAnalysisJob: vi.fn(),
  claimAnalysisJobById: vi.fn(),
  getAnalysisJobState: vi.fn(),
  embedCaptureAnalysis: vi.fn(),
  persistAnalysisResult: vi.fn(),
  failAnalysisJob: vi.fn(),
  getOpenAIClient: vi.fn(),
  getSupabaseServiceRoleClient: vi.fn(),
}));

vi.mock("@/features/analysis/worker/claim", () => ({
  claimAnalysisJob: mocks.claimAnalysisJob,
  claimAnalysisJobById: mocks.claimAnalysisJobById,
  getAnalysisJobState: mocks.getAnalysisJobState,
}));

vi.mock("@/features/analysis/worker/embeddings", () => ({
  embedCaptureAnalysis: mocks.embedCaptureAnalysis,
}));

vi.mock("@/features/analysis/worker/persist-analysis", () => ({
  persistAnalysisResult: mocks.persistAnalysisResult,
  failAnalysisJob: mocks.failAnalysisJob,
}));

vi.mock("@/lib/ai/client", () => ({
  getOpenAIClient: mocks.getOpenAIClient,
}));

vi.mock("@/lib/supabase/service-role", () => ({
  getSupabaseServiceRoleClient: mocks.getSupabaseServiceRoleClient,
}));

const rawText = "RAW_TEXT_MUST_NEVER_APPEAR_IN_ANALYSIS_LOGS";
const job = {
  jobId: "11111111-1111-4111-8111-111111111111",
  attemptId: "22222222-2222-4222-8222-222222222222",
  attemptNumber: 1,
  workspaceId: "33333333-3333-4333-8333-333333333333",
  captureId: "44444444-4444-4444-8444-444444444444",
  rawText,
  sourceKind: "paste",
  title: null,
  model: "gpt-5-mini",
  promptVersion: JOB_REGISTRY.captureStructuring.prompt.version,
};

const analysis = {
  captureSummary: "AI 답변을 지식으로 보존한다.",
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

const extractionUsage = {
  input_tokens: 120,
  output_tokens: 45,
  total_tokens: 165,
  input_tokens_details: {
    cache_write_tokens: 0,
    cached_tokens: 80,
  },
  output_tokens_details: {
    reasoning_tokens: 12,
  },
};

function response(outputParsed: typeof analysis | null) {
  return {
    id: "resp_capture_1",
    model: "gpt-5-mini-2025-08-07",
    usage: extractionUsage,
    output_parsed: outputParsed,
  };
}

function loggedEvents(spy: ReturnType<typeof vi.spyOn>) {
  return spy.mock.calls.map(([payload]) => JSON.parse(String(payload)) as {
    event: string;
    stage: string;
    model?: string;
    promptVersion?: string;
    responseId?: string;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    cachedTokens?: number;
    reasoningTokens?: number;
    embeddingTokens?: number;
  });
}

describe("runCaptureAnalysisJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSupabaseServiceRoleClient.mockReturnValue({});
    mocks.getAnalysisJobState.mockResolvedValue({
      jobId: job.jobId,
      workspaceId: job.workspaceId,
      captureId: job.captureId,
      status: "queued",
      retryCount: 0,
      maxAttempts: 3,
      nextRunAt: "2026-07-16T00:00:00.000Z",
      leaseExpiresAt: null,
    });
    mocks.claimAnalysisJobById.mockResolvedValue(job);
    mocks.embedCaptureAnalysis.mockResolvedValue({
      analysis: {
        ...analysis,
        captureEmbedding: [0.1],
        nodes: [{ ...analysis.nodes[0], embedding: [0.2] }],
      },
      usage: {
        model: "text-embedding-3-small",
        embeddingTokens: 33,
        totalTokens: 33,
      },
    });
    mocks.persistAnalysisResult.mockResolvedValue({ status: "completed" });
    mocks.failAnalysisJob.mockResolvedValue({
      recorded: true,
      status: "queued",
    });
  });

  it("uses the bounded first-pass request and emits extraction and embedding usage", async () => {
    const parse = vi.fn().mockResolvedValue(response(analysis));
    mocks.getOpenAIClient.mockReturnValue({ responses: { parse } });
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    const result = await runCaptureAnalysisJob(job.jobId);

    expect(result.claimed).toBe(1);
    expect(result.completed + result.needsReview).toBe(1);
    expect(parse).toHaveBeenCalledWith(
      expect.objectContaining({
        model: job.model,
        reasoning: {
          effort: JOB_REGISTRY.captureStructuring.model.reasoningEffort,
        },
        max_output_tokens:
          JOB_REGISTRY.captureStructuring.model.maxOutputTokens,
        prompt_cache_key: `${JOB_REGISTRY.captureStructuring.model.promptCacheKeyPrefix}:${job.promptVersion}`,
        input: expect.arrayContaining([
          expect.objectContaining({
            role: "system",
            content: expect.stringContaining("at most 12 nodes, 20 edges, and 12 contexts"),
          }),
        ]),
      }),
      {
        timeout: JOB_REGISTRY.captureStructuring.model.timeoutMs,
        maxRetries: JOB_REGISTRY.captureStructuring.model.maxRetries,
      },
    );

    const events = loggedEvents(info);
    expect(events).toContainEqual(
      expect.objectContaining({
        event: "provider.usage",
        stage: "extract",
        model: "gpt-5-mini-2025-08-07",
        promptVersion: job.promptVersion,
        responseId: "resp_capture_1",
        inputTokens: 120,
        outputTokens: 45,
        totalTokens: 165,
        cachedTokens: 80,
        reasoningTokens: 12,
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        event: "provider.usage",
        stage: "embed",
        model: "text-embedding-3-small",
        embeddingTokens: 33,
        totalTokens: 33,
      }),
    );
    expect(info.mock.calls.flat().join(" ")).not.toContain(rawText);
  });

  it("records provider usage and a retryable failure for an empty parsed output", async () => {
    const parse = vi.fn().mockResolvedValue(response(null));
    mocks.getOpenAIClient.mockReturnValue({ responses: { parse } });
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await runCaptureAnalysisJob(job.jobId);

    expect(result.failed).toBe(1);
    expect(result.errorCodes).toEqual(["ANALYSIS_EMPTY_PARSED_OUTPUT"]);
    expect(mocks.embedCaptureAnalysis).not.toHaveBeenCalled();
    expect(mocks.persistAnalysisResult).not.toHaveBeenCalled();
    expect(mocks.failAnalysisJob).toHaveBeenCalledWith(
      expect.anything(),
      job,
      expect.any(String),
      "ANALYSIS_EMPTY_PARSED_OUTPUT",
    );
    expect(loggedEvents(info)).toContainEqual(
      expect.objectContaining({
        event: "provider.usage",
        responseId: "resp_capture_1",
        totalTokens: 165,
      }),
    );
  });

  it("persists request failures and rethrows a correlated worker error", async () => {
    const parse = vi.fn().mockRejectedValue(new Error("ANALYSIS_PROVIDER_UNAVAILABLE"));
    mocks.getOpenAIClient.mockReturnValue({ responses: { parse } });
    mocks.failAnalysisJob.mockResolvedValue({
      recorded: true,
      status: "failed",
    });
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      runCaptureAnalysisJob(job.jobId, { rethrowFailures: true }),
    ).rejects.toEqual(
      expect.objectContaining({
        name: "CaptureAnalysisRunError",
        message: "ANALYSIS_PROVIDER_UNAVAILABLE",
        jobId: job.jobId,
        terminal: true,
      }),
    );
    expect(mocks.failAnalysisJob).toHaveBeenCalledWith(
      expect.anything(),
      job,
      expect.any(String),
      "ANALYSIS_PROVIDER_UNAVAILABLE",
    );
  });
});
