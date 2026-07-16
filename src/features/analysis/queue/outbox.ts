import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ANALYSIS_QUEUE_REGISTRY,
  JOB_REGISTRY,
} from "@/config/registry";
import { logAnalysisEvent } from "@/features/analysis/observability";
import {
  captureAnalysisEventSchema,
  type CaptureAnalysisEvent,
} from "@/features/analysis/queue/contracts";
import {
  dispatchCaptureAnalysis,
  type CaptureAnalysisDispatchResult,
} from "@/features/analysis/queue/dispatch";
import { runCaptureAnalysisJob } from "@/features/analysis/worker/run-capture-analysis";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import type { Database, Json } from "@/types/database";

type ServiceRoleClient = SupabaseClient<Database>;

type ClaimedAnalysisOutboxEvent = {
  event_id: string;
  workspace_id: string;
  aggregate_id: string;
  event_type: string;
  dedupe_key: string;
  payload: Json;
  attempts: number;
  created_at: string;
};

type Dispatcher = (
  event: CaptureAnalysisEvent,
  queueSender?: undefined,
  options?: { idempotencyKey?: string },
) => Promise<CaptureAnalysisDispatchResult>;
type FallbackRunner = (event: CaptureAnalysisEvent) => Promise<boolean>;
type AnalysisJobRunner = typeof runCaptureAnalysisJob;

export type AnalysisOutboxDrainResult = {
  claimed: number;
  published: number;
  retried: number;
  failed: number;
  eventIds: string[];
};

export type AnalysisOutboxDependencies = {
  supabase?: ServiceRoleClient;
  dispatcher?: Dispatcher;
  fallbackRunner?: FallbackRunner;
  workerId?: string;
};

export async function runCorrelatedAnalysisFallback(
  event: CaptureAnalysisEvent,
  runner: AnalysisJobRunner = runCaptureAnalysisJob,
) {
  const result = await runner(event.processingJobId, {
    expectedCaptureId: event.captureId,
    expectedWorkspaceId: event.workspaceId,
    maxAttempts: JOB_REGISTRY.captureStructuring.maxManualAttempts,
    rethrowFailures: true,
  });

  return (
    result.disposition === "processed" || result.disposition === "terminal"
  );
}

type DrainOptions = {
  limit: number;
  processingJobId?: string;
};

function payloadRecord(payload: Json): Record<string, Json | undefined> | null {
  return payload !== null && !Array.isArray(payload) && typeof payload === "object"
    ? payload
    : null;
}

function toAnalysisEvent(row: ClaimedAnalysisOutboxEvent) {
  const payload = payloadRecord(row.payload);

  return captureAnalysisEventSchema.safeParse({
    schemaVersion: ANALYSIS_QUEUE_REGISTRY.schemaVersion,
    eventType: row.event_type,
    processingJobId: payload?.processingJobId,
    captureId: payload?.captureId ?? row.aggregate_id,
    workspaceId: payload?.workspaceId ?? row.workspace_id,
    createdAt: row.created_at,
  });
}

async function failClaimedEvent(
  supabase: ServiceRoleClient,
  row: ClaimedAnalysisOutboxEvent,
  workerId: string,
  errorCode: string,
  maxAttempts: number = ANALYSIS_QUEUE_REGISTRY.poisonDeliveryThreshold,
) {
  const retryDelaySeconds = Math.min(
    300,
    JOB_REGISTRY.captureStructuring.retryBaseDelaySeconds *
      Math.max(1, row.attempts),
  );
  const { data, error } = await supabase.rpc("fail_analysis_outbox_event", {
      p_event_id: row.event_id,
      p_worker_id: workerId,
      p_error_code: errorCode,
      p_retry_delay_seconds: retryDelaySeconds,
      p_max_attempts: maxAttempts,
  });

  if (error || !data?.[0]) {
    throw new Error("ANALYSIS_OUTBOX_RELEASE_FAILED");
  }

  return data[0].status;
}

async function drainClaimedAnalysisOutbox(
  options: DrainOptions,
  dependencies: AnalysisOutboxDependencies = {},
): Promise<AnalysisOutboxDrainResult> {
  const supabase =
    dependencies.supabase ?? getSupabaseServiceRoleClient();

  if (!supabase) {
    throw new Error("ANALYSIS_OUTBOX_NOT_CONFIGURED");
  }

  const workerId = dependencies.workerId ?? `outbox-${randomUUID()}`;
  const dispatcher = dependencies.dispatcher ?? dispatchCaptureAnalysis;
  const claim = options.processingJobId
    ? await supabase.rpc("claim_analysis_outbox_event_by_job_id", {
        p_processing_job_id: options.processingJobId,
        p_worker_id: workerId,
        p_lease_seconds: 60,
      })
    : await supabase.rpc("claim_analysis_outbox_events", {
        p_worker_id: workerId,
        p_limit: options.limit,
        p_lease_seconds: 60,
      });
  const { data, error } = claim;

  if (error) {
    throw new Error("ANALYSIS_OUTBOX_CLAIM_FAILED");
  }

  const rows = (data ?? []) as ClaimedAnalysisOutboxEvent[];
  const result: AnalysisOutboxDrainResult = {
    claimed: rows.length,
    published: 0,
    retried: 0,
    failed: 0,
    eventIds: rows.map((row) => row.event_id),
  };

  for (const row of rows) {
    const parsed = toAnalysisEvent(row);

    if (!parsed.success) {
      await failClaimedEvent(
        supabase,
        row,
        workerId,
        "ANALYSIS_OUTBOX_EVENT_INVALID",
        1,
      );
      result.failed += 1;
      continue;
    }

    const dispatch = await dispatcher(parsed.data, undefined, {
      idempotencyKey: row.dedupe_key,
    });

    if (dispatch.transport === "fallback") {
      let fallbackActivated = false;

      if (dependencies.fallbackRunner) {
        try {
          fallbackActivated = await dependencies.fallbackRunner(parsed.data);
        } catch {
          fallbackActivated = false;
        }
      }

      if (fallbackActivated) {
        const completed = await supabase.rpc(
          "mark_analysis_outbox_published",
          {
            p_event_id: row.event_id,
            p_worker_id: workerId,
            p_message_id: null,
          },
        );

        if (completed.error || completed.data !== true) {
          throw new Error("ANALYSIS_OUTBOX_FALLBACK_CONFIRM_FAILED");
        }

        result.published += 1;
        logAnalysisEvent("info", {
          event: "outbox.fallback_completed",
          stage: "dispatch",
          jobId: parsed.data.processingJobId,
          captureId: parsed.data.captureId,
          workspaceId: parsed.data.workspaceId,
          outcome: "fallback_completed",
        });
        continue;
      }

      const status = await failClaimedEvent(
        supabase,
        row,
        workerId,
        dispatch.errorCode,
      );

      if (status === "failed") {
        result.failed += 1;
      } else {
        result.retried += 1;
      }
      continue;
    }

    const published = await supabase.rpc("mark_analysis_outbox_published", {
        p_event_id: row.event_id,
        p_worker_id: workerId,
        p_message_id: dispatch.messageId,
    });

    if (published.error || published.data !== true) {
      throw new Error("ANALYSIS_OUTBOX_PUBLISH_CONFIRM_FAILED");
    }

    result.published += 1;
    logAnalysisEvent("info", {
      event: "outbox.published",
      stage: "dispatch",
      jobId: parsed.data.processingJobId,
      captureId: parsed.data.captureId,
      workspaceId: parsed.data.workspaceId,
      queueMessageId: dispatch.messageId,
      outcome: "published",
    });
  }

  return result;
}

export async function drainAnalysisOutbox(
  limit = 10,
  dependencies: AnalysisOutboxDependencies = {},
) {
  return drainClaimedAnalysisOutbox({ limit }, dependencies);
}

export async function drainAnalysisOutboxForJob(
  processingJobId: string,
  dependencies: AnalysisOutboxDependencies = {},
) {
  return drainClaimedAnalysisOutbox(
    { limit: 1, processingJobId },
    {
      ...dependencies,
      fallbackRunner:
        dependencies.fallbackRunner ?? runCorrelatedAnalysisFallback,
    },
  );
}

export async function recordAnalysisOperatorRecovery(
  event: CaptureAnalysisEvent,
  deliveryCount: number,
  errorCode: string,
  supabase: ServiceRoleClient | null = getSupabaseServiceRoleClient(),
) {
  if (!supabase) {
    return false;
  }

  const { data, error } = await supabase.rpc(
    "record_analysis_operator_recovery",
    {
      p_job_id: event.processingJobId,
      p_workspace_id: event.workspaceId,
      p_capture_id: event.captureId,
      p_error_code: errorCode,
      p_delivery_count: deliveryCount,
    },
  );

  return !error && data === true;
}
