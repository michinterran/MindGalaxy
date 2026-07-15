import { describe, expect, it } from "vitest";
import { BRAND_COPY } from "@/config/brand";
import { messages } from "@/lib/i18n/messages";

describe("i18n dictionaries", () => {
  it("keeps Korean and English keys in exact parity", () => {
    expect(Object.keys(messages.en).sort()).toEqual(Object.keys(messages.ko).sort());
  });

  it("keeps the approved Korean brand copy exact and wired through i18n", () => {
    expect(BRAND_COPY.ko).toEqual({
      slogan: "AI의 답변을, 나의 지식으로.",
      philosophy: "대화는 지나가도, 지식은 남도록.",
      description:
        "여러 AI에서 얻은 답변을 보존하고 분석해, 맥락과 관계가 연결된 나만의 지식지도와 세컨드 브레인으로 만들어드립니다.",
    });
    expect(messages.ko["brand.slogan"]).toBe(BRAND_COPY.ko.slogan);
    expect(messages.ko["brand.philosophy"]).toBe(BRAND_COPY.ko.philosophy);
    expect(messages.ko["brand.description"]).toBe(BRAND_COPY.ko.description);
    expect(messages.en["brand.slogan"]).toBe(BRAND_COPY.en.slogan);
    expect(messages.en["brand.philosophy"]).toBe(BRAND_COPY.en.philosophy);
    expect(messages.en["brand.description"]).toBe(BRAND_COPY.en.description);
  });

  it("keeps approved semantic headline lines in i18n instead of JSX", () => {
    expect([
      messages.ko["brand.sloganLine1"],
      messages.ko["brand.sloganLine2"],
    ].join(" ")).toBe(BRAND_COPY.ko.slogan);
    expect([
      messages.ko["onboarding.titleLine1"],
      messages.ko["onboarding.titleLine2"],
    ].join(" ")).toBe(messages.ko["onboarding.title"]);
    expect(messages.ko["brand.sloganLine1"]).not.toMatch(/\n/);
    expect(messages.ko["onboarding.titleLine1"]).not.toMatch(/\n/);
  });

  it("keeps the visible search action and progress copy localized", () => {
    expect(messages.ko["workspace.toolbar.searchSubmit"]).toBe("질문하기");
    expect(messages.en["workspace.toolbar.searchSubmit"]).toBe("Ask");
    expect(messages.ko["workspace.search.progress.retrieve"]).toBeTruthy();
    expect(messages.ko["workspace.search.progress.evidence"]).toBeTruthy();
    expect(messages.ko["workspace.search.progress.answer"]).toBeTruthy();
  });

  it("keeps MVP toolbar keys free of removed canvas controls", () => {
    expect(messages.ko).not.toHaveProperty("workspace.toolbar.canvasToolsAria");
    expect(messages.ko).not.toHaveProperty("workspace.toolbar.fitView");
    expect(messages.ko).not.toHaveProperty("workspace.toolbar.zoomIn");
    expect(messages.ko).not.toHaveProperty("workspace.toolbar.inspector");
  });
});
