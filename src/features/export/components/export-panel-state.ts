import type { ExportKind } from "@/features/export/model/schemas";

export type ExportStatus = "idle" | "pending" | "success" | "error";

export type ExportPanelState = {
  activeKind: ExportKind | null;
  errors: Record<ExportKind, string | null>;
  requestSequence: number;
  statuses: Record<ExportKind, ExportStatus>;
};

export const EXPORT_KINDS = ["html", "pdf", "pptx"] as const satisfies readonly ExportKind[];

export function createExportPanelState(): ExportPanelState {
  return {
    activeKind: null,
    errors: {
      html: null,
      pdf: null,
      pptx: null,
    },
    requestSequence: 0,
    statuses: {
      html: "idle",
      pdf: "idle",
      pptx: "idle",
    },
  };
}

export function beginExportRequest(state: ExportPanelState, kind: ExportKind) {
  if (state.activeKind) {
    return { state, requestId: state.requestSequence, started: false };
  }

  const requestId = state.requestSequence + 1;

  return {
    requestId,
    started: true,
    state: {
      ...state,
      activeKind: kind,
      errors: { ...state.errors, [kind]: null },
      requestSequence: requestId,
      statuses: { ...state.statuses, [kind]: "pending" as const },
    },
  };
}

export function completeExportRequest(
  state: ExportPanelState,
  requestId: number,
  kind: ExportKind,
) {
  if (state.requestSequence !== requestId || state.activeKind !== kind) {
    return state;
  }

  return {
    ...state,
    activeKind: null,
    statuses: { ...state.statuses, [kind]: "success" as const },
  };
}

export function failExportRequest(
  state: ExportPanelState,
  requestId: number,
  kind: ExportKind,
  errorCode: string,
) {
  if (state.requestSequence !== requestId || state.activeKind !== kind) {
    return state;
  }

  return {
    ...state,
    activeKind: null,
    errors: { ...state.errors, [kind]: errorCode },
    statuses: { ...state.statuses, [kind]: "error" as const },
  };
}

export function cancelActiveExportRequest(state: ExportPanelState) {
  if (!state.activeKind) return state;

  return {
    ...state,
    activeKind: null,
    requestSequence: state.requestSequence + 1,
    statuses: { ...state.statuses, [state.activeKind]: "idle" as const },
  };
}

export function cancelExportRequest(
  state: ExportPanelState,
  requestId: number,
  kind: ExportKind,
) {
  if (state.requestSequence !== requestId || state.activeKind !== kind) {
    return state;
  }

  return cancelActiveExportRequest(state);
}
