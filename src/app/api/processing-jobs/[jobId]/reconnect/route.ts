import { after, NextResponse } from "next/server";
import { ANALYSIS_QUEUE_REGISTRY } from "@/config/registry";
import { buildAnalysisReconnectIdempotencyKey } from "@/features/analysis/queue/reconnect-policy";
import { dispatchCaptureAnalysis } from "@/features/analysis/queue/dispatch";
import { runCaptureAnalysisJob } from "@/features/analysis/worker/run-capture-analysis";
import { libraryIdSchema } from "@/features/library/model/schemas";
import { getReconnectableProcessingJobRecord } from "@/features/library/server/dal";
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
    const now = new Date();
    const result = await getReconnectableProcessingJobRecord(
      clients,
      libraryIdSchema.parse(rawJobId),
      now.getTime(),
    );
    const job = result.processingJob;
    const dispatch = await dispatchCaptureAnalysis(
      {
        schemaVersion: ANALYSIS_QUEUE_REGISTRY.schemaVersion,
        eventType: ANALYSIS_QUEUE_REGISTRY.eventType,
        processingJobId: job.id,
        captureId: job.captureId,
        workspaceId: job.workspaceId,
        createdAt: now.toISOString(),
      },
      undefined,
      {
        idempotencyKey: buildAnalysisReconnectIdempotencyKey(
          job.id,
          job.updatedAt,
        ),
      },
    );

    if (dispatch.transport === "fallback") {
      after(async () => {
        try {
          await runCaptureAnalysisJob(job.id, {
            expectedCaptureId: job.captureId,
            expectedWorkspaceId: job.workspaceId,
            maxAttempts: job.maxAttempts,
          });
        } catch (error) {
          console.error("[capture-analysis] reconnect background run failed", error);
        }
      });
    }

    return NextResponse.json(
      { ...result, analysisDispatch: dispatch.transport },
      { status: 202, headers: libraryResponseHeaders },
    );
  } catch (error) {
    return libraryErrorResponse(error);
  }
}
