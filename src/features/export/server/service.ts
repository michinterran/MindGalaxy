import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { ZodError } from "zod";
import { buildExportDocument } from "@/features/export/model/document";
import {
  buildExportFilename,
  contentDispositionAttachment,
} from "@/features/export/model/filename";
import {
  exportRequestSchema,
  type ExportKind,
  type ExportRequest,
} from "@/features/export/model/schemas";
import { getExportRenderer } from "@/features/export/renderers/registry";
import { loadWorkspaceGraph } from "@/features/knowledge-map/server/load-workspace-graph";
import { DEFAULT_LOCALE } from "@/lib/i18n";
import type { Database, Json } from "@/types/database";

export type ExportServiceResult = {
  bytes: Uint8Array;
  contentDisposition: string;
  filename: string;
  mimeType: string;
};

export class ExportServiceError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

function exportMetadata(value: Record<string, unknown>): Json {
  return value as Json;
}

async function updateExportStatus(
  supabase: SupabaseClient<Database>,
  {
    createdBy,
    exportId,
    workspaceId,
  }: {
    exportId: string;
    workspaceId: string;
    createdBy: string;
  },
  status: "running" | "completed" | "failed",
  metadata: Record<string, unknown>,
) {
  const { data, error } = await supabase
    .from("exports")
    .update({
      status,
      metadata: exportMetadata(metadata),
      updated_at: new Date().toISOString(),
    })
    .eq("id", exportId)
    .eq("workspace_id", workspaceId)
    .eq("created_by", createdBy)
    .select("id");

  if (error) {
    console.error("EXPORT_STATUS_UPDATE_FAILED", {
      exportId,
      workspaceId,
      status,
      code: error.code,
    });
    return false;
  }

  if (data?.length !== 1) {
    console.error("EXPORT_STATUS_UPDATE_AFFECTED_ROW_MISMATCH", {
      exportId,
      workspaceId,
      status,
      affectedRows: data?.length ?? 0,
    });
    return false;
  }

  return true;
}

async function workspaceName(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
) {
  const { data } = await supabase
    .from("workspaces")
    .select("name")
    .eq("id", workspaceId)
    .maybeSingle();

  return data?.name ?? "MindGalaxy";
}

function parseInput(input: unknown): ExportRequest {
  try {
    return exportRequestSchema.parse(input);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ExportServiceError(
        "Invalid export request",
        400,
        "VALIDATION_ERROR",
        error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      );
    }

    throw error;
  }
}

export async function createWorkspaceExport({
  input,
  supabase,
  user,
}: {
  input: unknown;
  supabase: SupabaseClient<Database>;
  user: User;
}): Promise<ExportServiceResult> {
  const request = parseInput(input);
  const startedAt = new Date().toISOString();
  const { data: exportRow, error: insertError } = await supabase
    .from("exports")
    .insert({
      workspace_id: request.workspaceId,
      kind: request.kind,
      status: "queued",
      created_by: user.id,
      metadata: exportMetadata({
        requested_at: startedAt,
        locale: request.locale,
      }),
    })
    .select("id")
    .single();

  if (insertError || !exportRow) {
    throw new ExportServiceError(
      "Could not create export row",
      403,
      "EXPORT_NOT_ALLOWED",
    );
  }

  try {
    await updateExportStatus(
      supabase,
      {
        createdBy: user.id,
        exportId: exportRow.id,
        workspaceId: request.workspaceId,
      },
      "running",
      {
        requested_at: startedAt,
        started_at: new Date().toISOString(),
        locale: request.locale,
      },
    );

    const graph = await loadWorkspaceGraph(
      supabase,
      request.workspaceId,
      request.locale ?? DEFAULT_LOCALE,
    );

    if (!graph?.nodes.length) {
      throw new ExportServiceError(
        "Workspace graph is empty",
        422,
        "EXPORT_EMPTY_GRAPH",
      );
    }

    const name = await workspaceName(supabase, request.workspaceId);
    const document = buildExportDocument({
      generatedAt: startedAt,
      graph,
      locale: request.locale ?? DEFAULT_LOCALE,
      workspaceName: name,
    });
    const rendered = await getExportRenderer(request.kind)(document);
    const filename = buildExportFilename({
      extension: rendered.extension as ExportKind,
      timestamp: startedAt,
      workspaceName: name,
    });

    await updateExportStatus(
      supabase,
      {
        createdBy: user.id,
        exportId: exportRow.id,
        workspaceId: request.workspaceId,
      },
      "completed",
      {
        requested_at: startedAt,
        completed_at: new Date().toISOString(),
        filename,
        kind: request.kind,
        locale: request.locale,
        mime_type: rendered.mimeType,
        node_count: document.nodes.length,
        truncated: document.truncation.truncated,
      },
    );

    return {
      bytes: rendered.bytes,
      contentDisposition: contentDispositionAttachment(filename),
      filename,
      mimeType: rendered.mimeType,
    };
  } catch (error) {
    const serviceError =
      error instanceof ExportServiceError
        ? error
        : new ExportServiceError(
            "Export rendering failed",
            500,
            "EXPORT_RENDER_FAILED",
          );

    if (!(error instanceof ExportServiceError)) {
      console.error("EXPORT_RENDER_FAILED", {
        exportId: exportRow.id,
        kind: request.kind,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    await updateExportStatus(
      supabase,
      {
        createdBy: user.id,
        exportId: exportRow.id,
        workspaceId: request.workspaceId,
      },
      "failed",
      {
        requested_at: startedAt,
        failed_at: new Date().toISOString(),
        code: serviceError.code,
        details: serviceError.details,
        kind: request.kind,
        locale: request.locale,
      },
    );

    throw serviceError;
  }
}
