"use client";

import { useState, useTransition } from "react";
import { ArrowRight, Sparkles } from "lucide-react";

type CapturePanelProps = {
  workspaceId: string;
};

type CaptureState =
  | { kind: "idle"; message: string }
  | { kind: "saving"; message: string }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

export function CapturePanel({ workspaceId }: CapturePanelProps) {
  const [rawText, setRawText] = useState("");
  const [title, setTitle] = useState("");
  const [state, setState] = useState<CaptureState>({
    kind: "idle",
    message: "원문은 먼저 저장되고, AI 분석 job은 queued 상태로 예약됩니다.",
  });
  const [isPending, startTransition] = useTransition();

  function submitCapture() {
    const trimmed = rawText.trim();

    if (!trimmed) {
      setState({
        kind: "error",
        message: "붙여넣은 원문이 있어야 저장할 수 있습니다.",
      });
      return;
    }

    setState({
      kind: "saving",
      message: "원문을 저장하고 AI 분석 job을 예약하는 중입니다.",
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
              label: "웹 붙여넣기",
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
        setState({
          kind: "success",
          message: "저장 완료. processing_jobs에 AI 구조화 작업이 예약됐습니다.",
        });
      } catch (error) {
        setState({
          kind: "error",
          message:
            error instanceof Error
              ? `저장 실패: ${error.message}`
              : "저장 실패: 다시 시도해 주세요.",
        });
      }
    });
  }

  return (
    <section className="rounded-[2rem] border border-line bg-panel/86 p-4 shadow-2xl shadow-black/40">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-source">
            Quick Capture
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-[-0.06em]">
            붙여넣으면
            <br />
            먼저 원문 저장
          </h2>
        </div>
        <Sparkles className="size-5 text-signal" />
      </div>

      <label className="mb-2 block text-xs font-medium text-muted" htmlFor="capture-title">
        제목
      </label>
      <input
        className="mb-3 w-full rounded-2xl border border-white/10 bg-black/45 px-3 py-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-source/60"
        id="capture-title"
        onChange={(event) => setTitle(event.target.value)}
        placeholder="비워두면 AI가 제목을 만들 예정"
        type="text"
        value={title}
      />

      <label className="mb-2 block text-xs font-medium text-muted" htmlFor="capture-raw-text">
        원문
      </label>
      <textarea
        className="min-h-40 w-full resize-none rounded-3xl border border-white/10 bg-black/45 p-4 text-sm leading-6 text-zinc-200 outline-none transition placeholder:text-zinc-600 focus:border-source/60"
        id="capture-raw-text"
        onChange={(event) => setRawText(event.target.value)}
        placeholder="ChatGPT / Claude / Gemini / 웹문서 내용을 그대로 붙여넣기..."
        value={rawText}
      />

      <div
        className={`mt-3 rounded-2xl border px-3 py-2 font-mono text-[11px] ${
          state.kind === "error"
            ? "border-red-400/30 bg-red-400/10 text-red-200"
            : state.kind === "success"
              ? "border-signal/30 bg-signal/10 text-signal"
              : "border-source/25 bg-source/10 text-source"
        }`}
      >
        {state.message}
      </div>

      <button
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-signal px-4 py-3 text-sm font-semibold text-black transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
        disabled={isPending}
        onClick={submitCapture}
        type="button"
      >
        {isPending ? "저장 중..." : "캡처 저장 후 AI 분석 예약"}
        <ArrowRight className="size-4" />
      </button>
    </section>
  );
}
