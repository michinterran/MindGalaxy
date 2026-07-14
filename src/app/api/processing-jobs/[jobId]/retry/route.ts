import { after, NextResponse } from "next/server";
import { runCaptureAnalysisBatch } from "@/features/analysis/worker/run-capture-analysis";
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

    after(async () => {
      try {
        await runCaptureAnalysisBatch(1, {
          maxAttempts: result.processingJob.maxAttempts,
        });
      } catch (error) {
        console.error("[capture-analysis] retry background run failed", error);
      }
    });

    return NextResponse.json(result, {
      status: 202,
      headers: libraryResponseHeaders,
    });
  } catch (error) {
    return libraryErrorResponse(error);
  }
}
