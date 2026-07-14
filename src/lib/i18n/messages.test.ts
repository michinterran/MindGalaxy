import { describe, expect, it } from "vitest";
import { messages } from "@/lib/i18n/messages";

describe("i18n dictionaries", () => {
  it("keeps Korean and English keys in exact parity", () => {
    expect(Object.keys(messages.en).sort()).toEqual(Object.keys(messages.ko).sort());
  });

  it("keeps MVP toolbar keys free of removed canvas controls", () => {
    expect(messages.ko).not.toHaveProperty("workspace.toolbar.canvasToolsAria");
    expect(messages.ko).not.toHaveProperty("workspace.toolbar.fitView");
    expect(messages.ko).not.toHaveProperty("workspace.toolbar.zoomIn");
    expect(messages.ko).not.toHaveProperty("workspace.toolbar.inspector");
  });
});
