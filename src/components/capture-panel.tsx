"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  FileText,
  Loader2,
  MessageSquareText,
  Sparkles,
} from "lucide-react";

type CapturePanelProps = {
  workspaceId: string;
  variant?: "panel" | "hero";
};

type CaptureState =
  | { kind: "idle"; message: string }
  | { kind: "saving"; message: string }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

function detectSource(rawText: string) {
  const lower = rawText.toLowerCase();

  if (lower.includes("chatgpt") || lower.includes("openai")) {
    return { label: "ChatGPT", icon: Bot };
  }

  if (lower.includes("claude")) {
    return { label: "Claude", icon: MessageSquareText };
  }

  if (lower.includes("gemini")) {
    return { label: "Gemini", icon: Sparkles };
  }

  return { label: rawText.trim() ? "붙여넣은 원문" : "원문 대기", icon: FileText };
}

export function CapturePanel({
  workspaceId,
  variant = "panel",
}: CapturePanelProps) {
  const router = useRouter();
  const [rawText, setRawText] = useState("");
  const [title, setTitle] = useState("");
  const [showTitle, setShowTitle] = useState(false);
  const [state, setState] = useState<CaptureState>({
    kind: "idle",
    message: "원문 먼저 저장",
  });
  const [isPending, startTransition] = useTransition();
  const source = useMemo(() => detectSource(rawText), [rawText]);
  const SourceIcon = source.icon;
  const textLength = rawText.trim().length;
  const isHero = variant === "hero";

  function submitCapture() {
    const trimmed = rawText.trim();

    if (!trimmed) {
      setState({
        kind: "error",
        message: "붙여넣은 내용이 필요합니다.",
      });
      return;
    }

    setState({
      kind: "saving",
      message: "원문 저장 중",
    });

    startTransition(async () => {
      try {
        const response = await fetch("/api/captures", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            workspaceId,
            title: title.trim() || undefined,
            rawText: trimmed,
            sourceKind: "paste",
            source: {
              label: source.label,
              provider: "manual",
            },
          }),
        });

        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(body?.error ?? "CAPTURE_CREATE_FAILED");
        }

        setTitle("");
        setRawText("");
        setShowTitle(false);
        setState({
          kind: "success",
          message: "저장 완료",
        });
        router.refresh();
      } catch (error) {
        setState({
          kind: "error",
          message:
            error instanceof Error
              ? `저장 실패: ${error.message}`
              : "저장 실패",
        });
      }
    });
  }

  return (
    <section
      className={`capture-panel ${isHero ? "capture-panel--hero" : ""}`}
      aria-label="새 자료 붙여넣기"
    >
      <div className="capture-panel__header">
        <div>
          <p className="ui-kicker">새 자료</p>
          <h2>{isHero ? "기억할 내용을 붙여넣으세요" : "Quick Capture"}</h2>
        </div>
        <div className="source-pill">
          <SourceIcon className="size-4" />
          <span>{source.label}</span>
        </div>
      </div>

      {showTitle ? (
        <label className="field-label" htmlFor="capture-title">
          제목
          <input
            id="capture-title"
            onChange={(event) => setTitle(event.target.value)}
            placeholder="비워두면 AI가 제안"
            type="text"
            value={title}
          />
        </label>
      ) : null}

      <label className="field-label" htmlFor="capture-raw-text">
        원문
        <textarea
          id="capture-raw-text"
          onChange={(event) => setRawText(event.target.value)}
          placeholder="ChatGPT, Claude, Gemini 답변이나 회의 메모를 그대로 붙여넣기"
          value={rawText}
        />
      </label>

      <div className="capture-panel__meta">
        <button
          className="ghost-button"
          onClick={() => setShowTitle((value) => !value)}
          type="button"
        >
          {showTitle ? "제목 숨기기" : "제목 직접 입력"}
        </button>
        <span>{textLength.toLocaleString()}자</span>
      </div>

      <div className={`status-line status-line--${state.kind}`}>
        {state.kind === "saving" ? <Loader2 className="size-4 animate-spin" /> : null}
        {state.kind === "success" ? <CheckCircle2 className="size-4" /> : null}
        <span>{state.message}</span>
      </div>

      <button
        className="primary-button"
        disabled={isPending}
        onClick={submitCapture}
        type="button"
      >
        {isPending ? "저장 중" : "정리 시작"}
        <ArrowRight className="size-4" />
      </button>
    </section>
  );
}
