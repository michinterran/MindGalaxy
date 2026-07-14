import { randomUUID } from "node:crypto";
import { zodTextFormat } from "openai/helpers/zod";
import { JOB_REGISTRY } from "@/config/registry";
import {
  captureAnalysisSchema,
  type CaptureAnalysisOutput,
} from "@/features/analysis/model/extraction-schema";
import { verifyEvidenceQuote } from "@/features/analysis/model/evidence";
import { scoreAnalysis } from "@/features/analysis/model/scoring";
import { claimAnalysisJob } from "@/features/analysis/worker/claim";
import { embedCaptureAnalysis } from "@/features/analysis/worker/embeddings";
import {
  failAnalysisJob,
  persistAnalysisResult,
} from "@/features/analysis/worker/persist-analysis";
import { CAPTURE_ANALYSIS_SYSTEM_PROMPT } from "@/features/analysis/worker/prompt";
import { getOpenAIClient } from "@/lib/ai/client";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

function attachVerifiedEvidence(
  analysis: CaptureAnalysisOutput,
  rawText: string,
  model: string,
  promptVersion: string,
  captureId: string,
  processingJobId: string,
  attemptId: string,
) {
  const evidenceItems: Array<{
    evidence: ReturnType<typeof verifyEvidenceQuote>;
    confidence: number;
  }> = [];

  const withMetadata = {
    ...analysis,
    nodes: analysis.nodes.map((node) => {
      const evidence = verifyEvidenceQuote(rawText, node.evidence?.quote);
      evidenceItems.push({ evidence, confidence: node.confidence });

      return {
        ...node,
        evidence: evidence
          ? {
              ...evidence,
              captureId,
              model,
              promptVersion,
              processingJobId,
              attemptId,
            }
          : undefined,
      };
    }),
    edges: analysis.edges.map((edge) => {
      const evidence = verifyEvidenceQuote(rawText, edge.evidence?.quote);
      evidenceItems.push({ evidence, confidence: edge.confidence });

      return {
        ...edge,
        evidence: evidence
          ? {
              ...evidence,
              captureId,
              model,
              promptVersion,
              processingJobId,
              attemptId,
            }
          : undefined,
      };
    }),
    contexts: analysis.contexts.map((context) => {
      const evidence = verifyEvidenceQuote(rawText, context.evidence?.quote);
      evidenceItems.push({ evidence, confidence: context.confidence });

      return {
        ...context,
        evidence: evidence
          ? {
              ...evidence,
              captureId,
              model,
              promptVersion,
              processingJobId,
              attemptId,
            }
          : undefined,
      };
    }),
  } satisfies CaptureAnalysisOutput;

  return {
    analysis: withMetadata,
    score: scoreAnalysis(withMetadata, evidenceItems),
  };
}

export async function runCaptureAnalysisBatch(
  limit: number,
  options: { maxAttempts?: number } = {},
) {
  const safeLimit = Math.min(Math.max(limit, 1), JOB_REGISTRY.captureStructuring.maxBatchSize);
  const supabase = getSupabaseServiceRoleClient();
  const openai = getOpenAIClient();

  if (!supabase || !openai) {
    throw new Error("ANALYSIS_WORKER_NOT_CONFIGURED");
  }

  const workerId = `mindgalaxy-worker-${process.pid}-${randomUUID()}`;
  const results = {
    claimed: 0,
    completed: 0,
    needsReview: 0,
    failed: 0,
    jobIds: [] as string[],
  };

  for (let index = 0; index < safeLimit; index += 1) {
    const job = await claimAnalysisJob(
      supabase,
      workerId,
      options.maxAttempts,
    );

    if (!job) break;

    results.claimed += 1;
    results.jobIds.push(job.jobId);

    try {
      const response = await openai.responses.parse({
        model: job.model,
        input: [
          {
            role: "system",
            content: CAPTURE_ANALYSIS_SYSTEM_PROMPT,
          },
          {
            role: "user",
            content: job.rawText,
          },
        ],
        text: {
          format: zodTextFormat(captureAnalysisSchema, "capture_analysis"),
        },
      });

      if (!response.output_parsed) {
        throw new Error("ANALYSIS_EMPTY_PARSED_OUTPUT");
      }

      const { analysis, score } = attachVerifiedEvidence(
        response.output_parsed,
        job.rawText,
        job.model,
        job.promptVersion,
        job.captureId,
        job.jobId,
        job.attemptId,
      );
      const analysisWithEmbeddings = await embedCaptureAnalysis(openai, job, analysis);

      await persistAnalysisResult(
        supabase,
        job,
        workerId,
        analysisWithEmbeddings,
        score,
      );

      if (score.reviewRequired) results.needsReview += 1;
      else results.completed += 1;
    } catch {
      results.failed += 1;
      await failAnalysisJob(supabase, job, workerId, "ANALYSIS_RUN_FAILED");
    }
  }

  return results;
}
