import type { Locale } from "@/lib/i18n";
import type { ExportKind } from "@/features/export/model/schemas";

export type ExportDownload = {
  blob: Blob;
  filename: string;
  kind: ExportKind;
};

export class ExportClientError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
  ) {
    super(code);
  }
}

export function isAbortErrorLike(error: unknown) {
  if (error instanceof DOMException || error instanceof Error) {
    return error.name === "AbortError";
  }

  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  );
}

function filenameFromContentDisposition(value: string | null, fallback: string) {
  if (!value) return fallback;

  const encoded = value.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      return fallback;
    }
  }

  return value.match(/filename="([^"]+)"/i)?.[1] ?? fallback;
}

export async function requestWorkspaceExport(
  {
    kind,
    locale,
    workspaceId,
  }: {
    workspaceId: string;
    kind: ExportKind;
    locale: Locale;
  },
  options: { signal?: AbortSignal } = {},
): Promise<ExportDownload> {
  const response = await fetch("/api/exports", {
    body: JSON.stringify({ kind, locale, workspaceId }),
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
    signal: options.signal,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: "EXPORT_FAILED" }));
    throw new ExportClientError(
      typeof payload.error === "string" ? payload.error : "EXPORT_FAILED",
      response.status,
    );
  }

  return {
    blob: await response.blob(),
    filename: filenameFromContentDisposition(
      response.headers.get("content-disposition"),
      `mindgalaxy-export.${kind}`,
    ),
    kind,
  };
}

export function downloadExportBlob(download: ExportDownload) {
  const url = URL.createObjectURL(download.blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = download.filename;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export const testables = {
  filenameFromContentDisposition,
};
