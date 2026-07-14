import { describe, expect, it } from "vitest";
import {
  fallbackGroundedAnswer,
  validateGroundedAnswer,
} from "@/features/search/model/grounding";
import type {
  GroundedAnswer,
  SearchResult,
} from "@/features/search/model/schemas";

const result: SearchResult = {
  resultId: "node:1",
  sourceType: "node",
  title: "검색 노드",
  snippet: "하이브리드 검색은 lexical, semantic, graph score를 결합한다.",
  evidence: "semantic score는 embedding 기반이다.",
  nodeKind: "idea",
  captureId: "00000000-0000-4000-8000-000000000001",
  lexicalScore: 0.5,
  semanticScore: 0.7,
  graphScore: 0.2,
  finalScore: 0.58,
};

describe("validateGroundedAnswer", () => {
  it("keeps citations that reference a top result and exact quote", () => {
    const answer: GroundedAnswer = {
      answer: "검색은 세 점수를 결합합니다.",
      grounded: true,
      confidence: 0.8,
      citations: [{ resultId: "node:1", quote: "lexical, semantic, graph score" }],
    };

    expect(validateGroundedAnswer(answer, [result]).citations).toHaveLength(1);
  });

  it("falls back when citation resultId is not in top results", () => {
    const answer = validateGroundedAnswer(
      {
        answer: "모델이 만든 근거 없는 답변",
        grounded: true,
        confidence: 0.9,
        citations: [{ resultId: "node:missing", quote: "근거" }],
      },
      [result],
    );

    expect(answer.grounded).toBe(false);
    expect(answer.citations).toEqual([]);
    expect(answer.answer).not.toBe("모델이 만든 근거 없는 답변");
  });

  it("falls back when quote is not present in snippet or evidence", () => {
    const answer = validateGroundedAnswer(
      {
        answer: "근거 없는 답변",
        grounded: true,
        confidence: 0.9,
        citations: [{ resultId: "node:1", quote: "없는 문장" }],
      },
      [result],
    );

    expect(answer.grounded).toBe(false);
  });

  it("does not promote a model-declared ungrounded answer even with valid citations", () => {
    const answer = validateGroundedAnswer(
      {
        answer: "모델이 스스로 근거 부족이라고 한 답변",
        grounded: false,
        confidence: 0.7,
        citations: [{ resultId: "node:1", quote: "semantic score는 embedding 기반" }],
      },
      [result],
    );

    expect(answer).toEqual(fallbackGroundedAnswer());
  });

  it("falls back when valid and invalid citations are mixed", () => {
    const answer = validateGroundedAnswer(
      {
        answer: "일부 citation만 맞는 답변",
        grounded: true,
        confidence: 0.8,
        citations: [
          { resultId: "node:1", quote: "lexical, semantic, graph score" },
          { resultId: "node:1", quote: "없는 문장" },
        ],
      },
      [result],
    );

    expect(answer).toEqual(fallbackGroundedAnswer());
  });

  it("falls back when answer text is empty", () => {
    const answer = validateGroundedAnswer(
      {
        answer: "",
        grounded: true,
        confidence: 0.8,
        citations: [{ resultId: "node:1", quote: "lexical, semantic, graph score" }],
      },
      [result],
    );

    expect(answer).toEqual(fallbackGroundedAnswer());
  });
});

describe("fallbackGroundedAnswer", () => {
  it("returns low-confidence ungrounded answer", () => {
    expect(fallbackGroundedAnswer().grounded).toBe(false);
    expect(fallbackGroundedAnswer().confidence).toBeLessThan(0.5);
  });

  it("uses the requested locale", () => {
    expect(fallbackGroundedAnswer("en").answer).toContain("not contain enough evidence");
  });
});
