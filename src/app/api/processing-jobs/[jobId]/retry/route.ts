import { after, NextResponse } from "next/server";
import { ANALYSIS_QUEUE_REGISTRY } from "@/config/registry";
import { dispatchCaptureAnalysis } from "@/features/analysis/queue/dispatch";
import { runCaptureAnalysisJob } from "@/features/analysis/worker/run-capture-analysis";
import { libraryIdSchema } from "@/features/library/model/schemas";
import { retryProcessingJobRecord } from "@/features/library/server/dal";
import {
  libraryErrorResponse,
  libraryResponseHeaders,
  requireLibraryClients,
} from "@/features/library/server/http";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const clients = await requireLibraryClients();
    const { jobId: rawJobId } = await params;
    const result = await retryProcessingJobRecord(
      clients,
      libraryIdSchema.parse(rawJobId),
    );
    const dispatch = await dispatchCaptureAnalysis(
      {
        schemaVersion: ANALYSIS_QUEUE_REGISTRY.schemaVersion,
        eventType: ANALYSIS_QUEUE_REGISTRY.eventType,
        processingJobId: result.processingJob.id,
        captureId: result.processingJob.captureId,
        workspaceId: result.processingJob.workspaceId,
        createdAt: new Date().toISOString(),
      },
      undefined,
      {
        idempotencyKey: `capture-analysis:${result.processingJob.id}:retry:${result.processingJob.retryCount}`,
      },
    );

    if (dispatch.transport === "fallback") {
      after(async () => {
        try {
          await runCaptureAnalysisJob(result.processingJob.id, {
            expectedCaptureId: result.processingJob.captureId,
            expectedWorkspaceId: result.processingJob.workspaceId,
            maxAttempts: result.processingJob.maxAttempts,
          });
        } catch (error) {
          console.error("[capture-analysis] retry background run failed", error);
        }
      });
    }

    return NextResponse.json({ ...result, analysisDispatch: dispatch.transport }, {
      status: 202,
      headers: libraryResponseHeaders,
    });
  } catch (error) {
    return libraryErrorResponse(error);
  }
}
