import type { ExportKind } from "@/features/export/model/schemas";

const RESERVED_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001f\u007f]/g;
const HEADER_UNSAFE_FILENAME_CHARS = /[\r\n"\\;\u0000-\u001f\u007f]/g;

export function sanitizeFilenamePart(value: string) {
  const normalized = value
    .normalize("NFKC")
    .replace(RESERVED_FILENAME_CHARS, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.\-\s]+/, "")
    .replace(/[.\-\s]+$/, "")
    .slice(0, 80);

  return normalized || "mindgalaxy-export";
}

export function buildExportFilename({
  extension,
  timestamp,
  workspaceName,
}: {
  workspaceName: string;
  extension: ExportKind;
  timestamp: string;
}) {
  const safeWorkspace = sanitizeFilenamePart(workspaceName);
  const safeTimestamp = timestamp.replace(/[:.]/g, "-");
  return `${safeWorkspace}-${safeTimestamp}.${extension}`;
}

export function contentDispositionAttachment(filename: string) {
  const safeFilename =
    filename
      .normalize("NFKC")
      .replace(HEADER_UNSAFE_FILENAME_CHARS, "-")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^[.\-\s]+/, "")
      .replace(/[.\-\s]+$/, "")
      .slice(0, 120) || "mindgalaxy-export";
  const asciiFallback = safeFilename
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(HEADER_UNSAFE_FILENAME_CHARS, "_");

  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(
    safeFilename,
  )}`;
}
