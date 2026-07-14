import { describe, expect, it } from "vitest";
import {
  beginExportRequest,
  cancelActiveExportRequest,
  cancelExportRequest,
  completeExportRequest,
  createExportPanelState,
  failExportRequest,
} from "@/features/export/components/export-panel-state";

describe("export panel request state", () => {
  it("allows only one active export request at a time", () => {
    const first = beginExportRequest(createExportPanelState(), "html");
    const second = beginExportRequest(first.state, "pdf");

    expect(first.started).toBe(true);
    expect(second.started).toBe(false);
    expect(second.state.activeKind).toBe("html");
    expect(second.state.statuses).toMatchObject({
      html: "pending",
      pdf: "idle",
    });
  });

  it("ignores stale success or error completions", () => {
    const first = beginExportRequest(createExportPanelState(), "html");
    const canceled = cancelActiveExportRequest(first.state);
    const second = beginExportRequest(canceled, "pdf");

    const staleSuccess = completeExportRequest(second.state, first.requestId, "html");
    const staleError = failExportRequest(staleSuccess, first.requestId, "html", "STALE");
    const completed = completeExportRequest(staleError, second.requestId, "pdf");

    expect(completed.statuses.html).toBe("idle");
    expect(completed.statuses.pdf).toBe("success");
    expect(completed.errors.html).toBeNull();
  });

  it("restores the active pending request to idle on cancel", () => {
    const request = beginExportRequest(createExportPanelState(), "pptx");
    const canceled = cancelActiveExportRequest(request.state);

    expect(canceled.activeKind).toBeNull();
    expect(canceled.statuses.pptx).toBe("idle");
    expect(canceled.requestSequence).toBeGreaterThan(request.requestId);
  });

  it("ignores stale abort cancellation after a newer request starts", () => {
    const first = beginExportRequest(createExportPanelState(), "html");
    const canceled = cancelActiveExportRequest(first.state);
    const second = beginExportRequest(canceled, "pptx");
    const staleAbort = cancelExportRequest(second.state, first.requestId, "html");

    expect(staleAbort.activeKind).toBe("pptx");
    expect(staleAbort.statuses.pptx).toBe("pending");
  });
});
