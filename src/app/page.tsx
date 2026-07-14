import {
  Brain,
  Brackets,
  CircleDotDashed,
  FileText,
  GitBranch,
  Inbox,
  Layers3,
  LockKeyhole,
  LogOut,
  Mail,
  Orbit,
  Search,
  ShieldCheck,
} from "lucide-react";
import { signInWithEmail, signInWithGoogle, signOut } from "@/app/auth/actions";
import { CapturePanel } from "@/components/capture-panel";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureDefaultWorkspace } from "@/lib/workspaces/bootstrap";
import type { Capture, MindContext, MindEdge, MindNode } from "@/types/domain";

const mockCapture: Capture = {
  id: "cap_demo_001",
  workspaceId: "ws_demo",
  projectId: "proj_mvp",
  title: "PPT export와 Galaxy View 범위 결정",
  rawText:
    "MVP에서는 PDF/HTML export를 우선 제공하고, PPT export는 editable mindmap PPT와 AI presentation PPT 두 모드로 이후 확장한다. Galaxy View는 복잡한 3D 편집기가 아니라 탐색 베타로 제한한다.",
  sourceKind: "paste",
  createdBy: "user_demo",
  createdAt: "2026-07-14T09:00:00.000Z",
  updatedAt: "2026-07-14T09:00:00.000Z",
};

const mockNodes: MindNode[] = [
  {
    id: "node_source",
    workspaceId: "ws_demo",
    projectId: "proj_mvp",
    captureId: mockCapture.id,
    kind: "source_summary",
    title: "원문",
    summary: "붙여넣은 원문을 보존한 출처 레이어",
    evidenceSnippet: mockCapture.rawText.slice(0, 56),
    confidence: 1,
    createdAt: "2026-07-14T09:01:00.000Z",
    updatedAt: "2026-07-14T09:01:00.000Z",
  },
  {
    id: "node_summary",
    workspaceId: "ws_demo",
    projectId: "proj_mvp",
    captureId: mockCapture.id,
    kind: "claim",
    title: "요약",
    summary: "MVP export는 PDF/HTML 우선, PPT는 확장 슬롯으로 보존",
    evidenceSnippet: "MVP에서는 PDF/HTML export를 우선 제공",
    confidence: 0.88,
    createdAt: "2026-07-14T09:01:20.000Z",
    updatedAt: "2026-07-14T09:01:20.000Z",
  },
  {
    id: "node_topic",
    workspaceId: "ws_demo",
    projectId: "proj_mvp",
    captureId: mockCapture.id,
    kind: "idea",
    title: "주제",
    summary: "View와 export는 같은 graph data를 다른 방식으로 표현",
    evidenceSnippet: "Galaxy View는 복잡한 3D 편집기가 아니라 탐색 베타",
    confidence: 0.82,
    createdAt: "2026-07-14T09:01:40.000Z",
    updatedAt: "2026-07-14T09:01:40.000Z",
  },
  {
    id: "node_evidence",
    workspaceId: "ws_demo",
    projectId: "proj_mvp",
    captureId: mockCapture.id,
    kind: "task",
    title: "근거",
    summary: "검색 답변은 원문 snippet을 함께 보여줘야 함",
    evidenceSnippet: "editable mindmap PPT와 AI presentation PPT 두 모드",
    confidence: 0.79,
    createdAt: "2026-07-14T09:02:00.000Z",
    updatedAt: "2026-07-14T09:02:00.000Z",
  },
];

const mockEdges: MindEdge[] = [
  {
    id: "edge_001",
    workspaceId: "ws_demo",
    sourceNodeId: "node_source",
    targetNodeId: "node_summary",
    kind: "derived_from",
    label: "원문 기반",
    confidence: 0.93,
    createdAt: "2026-07-14T09:02:10.000Z",
  },
  {
    id: "edge_002",
    workspaceId: "ws_demo",
    sourceNodeId: "node_summary",
    targetNodeId: "node_topic",
    kind: "relates_to",
    label: "관련",
    confidence: 0.84,
    createdAt: "2026-07-14T09:02:20.000Z",
  },
  {
    id: "edge_003",
    workspaceId: "ws_demo",
    sourceNodeId: "node_topic",
    targetNodeId: "node_evidence",
    kind: "supports",
    label: "근거",
    confidence: 0.8,
    createdAt: "2026-07-14T09:02:30.000Z",
  },
];

const mockContexts: MindContext[] = [
  {
    id: "ctx_topic_export",
    workspaceId: "ws_demo",
    kind: "topic",
    label: "Export",
    normalizedValue: "export",
    createdAt: "2026-07-14T09:03:00.000Z",
  },
  {
    id: "ctx_topic_galaxy",
    workspaceId: "ws_demo",
    kind: "topic",
    label: "Galaxy View",
    normalizedValue: "galaxy_view",
    createdAt: "2026-07-14T09:03:10.000Z",
  },
  {
    id: "ctx_time",
    workspaceId: "ws_demo",
    kind: "time",
    label: "MVP 이후",
    normalizedValue: "post_mvp",
    createdAt: "2026-07-14T09:03:20.000Z",
  },
];

const inboxItems = [
  {
    title: "Claude 전략 대화",
    source: "원문 3,842자",
    status: "AI 구조화 대기",
  },
  {
    title: "웹 리서치 메모",
    source: "URL + 붙여넣기",
    status: "관계 후보 12개",
  },
  {
    title: "제품 회의록",
    source: "수동 캡처",
    status: "시간/장소 추출 완료",
  },
];

const nodePositions: Record<
  string,
  { x: string; y: string; tone: "source" | "ai" }
> = {
  node_source: { x: "14%", y: "52%", tone: "source" },
  node_summary: { x: "38%", y: "30%", tone: "ai" },
  node_topic: { x: "56%", y: "58%", tone: "ai" },
  node_evidence: { x: "76%", y: "38%", tone: "source" },
};

const detailRows = [
  ["Source", "Capture ID / 원문 snippet 유지"],
  ["AI", "node · edge · context 후보 분리"],
  ["Search", "근거 부족 시 단정 금지"],
];

function AuthScreen({ configured }: { configured: boolean }) {
  return (
    <main className="min-h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(125,211,252,0.18),transparent_26%),radial-gradient(circle_at_80%_2%,rgba(196,181,253,0.12),transparent_30%),linear-gradient(135deg,rgba(255,255,255,0.05)_0_1px,transparent_1px)] bg-[length:auto,auto,34px_34px]" />
      <section className="relative mx-auto grid min-h-screen w-full max-w-6xl items-center gap-8 px-5 py-8 lg:grid-cols-[1fr_420px]">
        <div>
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-line bg-white/[0.04] px-3 py-2 font-mono text-[11px] uppercase tracking-[0.28em] text-source">
            <ShieldCheck className="size-4" />
            Supabase Auth Ready
          </div>
          <h1 className="max-w-3xl text-5xl font-semibold tracking-[-0.08em] text-zinc-50 md:text-7xl">
            복사한 지식이
            <br />
            바로 기억으로 쌓이는 곳
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-muted">
            Google 또는 이메일로 로그인하면 개인 workspace가 자동으로 생성됩니다.
            이후 붙여넣은 원문은 안전하게 저장되고, AI 구조화 작업은 job으로
            예약됩니다.
          </p>
        </div>

        <section className="rounded-[2rem] border border-line bg-panel/90 p-5 shadow-2xl shadow-black/50">
          <p className="font-mono text-[11px] uppercase tracking-[0.32em] text-ai">
            Sign in
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-[-0.05em]">
            MindGalaxy 시작
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Google SSO가 가장 빠릅니다. 이메일은 magic link 방식으로 동작합니다.
          </p>

          {!configured ? (
            <div className="mt-5 rounded-2xl border border-red-400/25 bg-red-400/10 p-4 text-sm text-red-100">
              Supabase 환경변수가 아직 설정되지 않았습니다.
            </div>
          ) : null}

          <form action={signInWithGoogle} className="mt-5">
            <button
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-signal"
              disabled={!configured}
              type="submit"
            >
              <span className="grid size-5 place-items-center rounded-full bg-black text-xs font-bold text-white">
                G
              </span>
              Google로 계속하기
            </button>
          </form>

          <div className="my-5 flex items-center gap-3 text-xs text-muted">
            <div className="h-px flex-1 bg-line" />
            또는
            <div className="h-px flex-1 bg-line" />
          </div>

          <form action={signInWithEmail} className="space-y-3">
            <label className="block text-xs font-medium text-muted" htmlFor="email">
              이메일
            </label>
            <input
              className="w-full rounded-2xl border border-white/10 bg-black/45 px-3 py-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-source/60"
              id="email"
              name="email"
              placeholder="you@example.com"
              required
              type="email"
            />
            <button
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-line bg-white/[0.04] px-4 py-3 text-sm font-semibold text-zinc-100 transition hover:border-source/50 hover:bg-source/10"
              disabled={!configured}
              type="submit"
            >
              <Mail className="size-4" />
              이메일 링크 받기
            </button>
          </form>
        </section>
      </section>
    </main>
  );
}

function WorkspaceErrorScreen() {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-6 text-foreground">
      <section className="w-full max-w-md rounded-[2rem] border border-line bg-panel/90 p-6 shadow-2xl shadow-black/50">
        <p className="font-mono text-[11px] uppercase tracking-[0.32em] text-ai">
          Workspace Error
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-[-0.05em]">
          workspace 생성에 실패했습니다.
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          Supabase RLS 또는 테이블 정책을 다시 확인해야 합니다. 로그아웃 후 다시
          시도할 수 있습니다.
        </p>
        <form action={signOut} className="mt-6">
          <button
            className="inline-flex rounded-2xl bg-signal px-4 py-3 text-sm font-semibold text-black transition hover:bg-white"
            type="submit"
          >
            로그아웃
          </button>
        </form>
      </section>
    </main>
  );
}

export default async function Home() {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return <AuthScreen configured={false} />;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <AuthScreen configured />;
  }

  let workspace: Awaited<ReturnType<typeof ensureDefaultWorkspace>>;

  try {
    workspace = await ensureDefaultWorkspace(supabase, user);
  } catch {
    return <WorkspaceErrorScreen />;
  }

  return (
    <main className="min-h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_18%_10%,rgba(125,211,252,0.16),transparent_28%),radial-gradient(circle_at_82%_0%,rgba(196,181,253,0.14),transparent_30%),linear-gradient(135deg,rgba(255,255,255,0.06)_0_1px,transparent_1px)] bg-[length:auto,auto,34px_34px]" />
      <section className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between rounded-[2rem] border border-line bg-white/[0.03] px-5 py-4 shadow-2xl shadow-black/40 backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-2xl border border-white/15 bg-white/10">
              <Brain className="size-5 text-signal" />
            </div>
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.34em] text-muted">
                MindGalaxy MVP
              </p>
              <h1 className="text-lg font-semibold tracking-[-0.03em]">
                개인 AI 지식 저장소
              </h1>
            </div>
          </div>
          <div className="hidden items-center gap-3 sm:flex">
            <div className="rounded-full border border-line bg-black/30 px-3 py-2 text-xs text-muted">
              <LockKeyhole className="mr-1 inline size-3.5 text-source" />
              {workspace.name} · {user.email}
            </div>
            <form action={signOut}>
              <button
                className="grid size-10 place-items-center rounded-2xl border border-line bg-white/[0.04] text-muted transition hover:border-source/50 hover:text-source"
                title="로그아웃"
                type="submit"
              >
                <LogOut className="size-4" />
              </button>
            </form>
          </div>
        </header>

        <div className="grid flex-1 gap-4 py-4 lg:grid-cols-[320px_minmax(0,1fr)_340px]">
          <aside className="flex flex-col gap-4">
            <CapturePanel workspaceId={workspace.id} />

            <section className="rounded-[2rem] border border-line bg-panel/72 p-4">
              <div className="mb-3 flex items-center gap-2">
                <Inbox className="size-4 text-source" />
                <h2 className="font-semibold">Inbox / List</h2>
              </div>
              <div className="space-y-2">
                {inboxItems.map((item) => (
                  <article
                    className="rounded-2xl border border-white/10 bg-white/[0.035] p-3"
                    key={item.title}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-sm font-medium">{item.title}</h3>
                      <CircleDotDashed className="mt-0.5 size-3.5 text-ai" />
                    </div>
                    <p className="mt-2 text-xs text-muted">{item.source}</p>
                    <p className="mt-1 font-mono text-[11px] text-ai">
                      {item.status}
                    </p>
                  </article>
                ))}
                <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted">
                    Mock graph
                  </p>
                  <p className="mt-1 text-sm text-zinc-200">
                    capture {mockCapture.id} · nodes {mockNodes.length} · edges{" "}
                    {mockEdges.length} · contexts {mockContexts.length}
                  </p>
                </div>
              </div>
            </section>
          </aside>

          <section className="relative min-h-[620px] overflow-hidden rounded-[2.25rem] border border-line bg-[linear-gradient(180deg,rgba(255,255,255,0.065),rgba(255,255,255,0.015))] p-4 shadow-2xl shadow-black/50">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(214,255,107,0.08),transparent_34%),linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[length:auto,52px_52px,52px_52px]" />
            <div className="relative z-10 flex items-center justify-between">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ai">
                  2D Mindmap Canvas
                </p>
                <h2 className="mt-1 text-3xl font-semibold tracking-[-0.07em]">
                  같은 graph data의 첫 번째 작업 뷰
                </h2>
              </div>
              <div className="rounded-full border border-line bg-black/40 px-3 py-2 font-mono text-[11px] text-muted">
                nodes · edges · contexts
              </div>
            </div>

            <div className="absolute left-[18%] top-[54%] h-px w-[26%] -rotate-12 bg-source/40" />
            <div className="absolute left-[40%] top-[38%] h-px w-[22%] rotate-[28deg] bg-ai/45" />
            <div className="absolute left-[58%] top-[51%] h-px w-[20%] -rotate-[24deg] bg-white/25" />

            {mockNodes.map((node) => {
              const position = nodePositions[node.id];

              return (
                <div
                  className={`absolute z-10 grid size-24 place-items-center rounded-[2rem] border text-sm font-semibold shadow-2xl backdrop-blur ${
                    position.tone === "source"
                      ? "border-source/35 bg-source/12 text-source shadow-source/10"
                      : "border-ai/35 bg-ai/12 text-ai shadow-ai/10"
                  }`}
                  key={node.id}
                  style={{ left: position.x, top: position.y }}
                  title={node.summary}
                >
                  {node.title}
                </div>
              );
            })}

            <div className="absolute bottom-4 left-4 right-4 z-10 grid gap-3 md:grid-cols-3">
              <div className="rounded-3xl border border-source/25 bg-black/52 p-4">
                <FileText className="mb-3 size-5 text-source" />
                <p className="text-sm font-semibold">Source Layer</p>
                <p className="mt-2 text-xs leading-5 text-muted">
                  원문과 출처는 AI 결과와 분리 저장. 실패해도 재분석 가능.
                </p>
              </div>
              <div className="rounded-3xl border border-ai/25 bg-black/52 p-4">
                <GitBranch className="mb-3 size-5 text-ai" />
                <p className="text-sm font-semibold">AI Graph Layer</p>
                <p className="mt-2 text-xs leading-5 text-muted">
                  nodes, edges, contexts로 관계를 저장하고 view는 별도 표현.
                </p>
              </div>
              <div className="rounded-3xl border border-signal/25 bg-black/52 p-4">
                <Search className="mb-3 size-5 text-signal" />
                <p className="text-sm font-semibold">Grounded Search</p>
                <p className="mt-2 text-xs leading-5 text-muted">
                  검색 답변은 source snippet 근거와 함께만 보여주는 방향.
                </p>
              </div>
            </div>
          </section>

          <aside className="flex flex-col gap-4">
            <section className="overflow-hidden rounded-[2rem] border border-line bg-panel/80 p-4">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-signal">
                    Galaxy Beta
                  </p>
                  <h2 className="mt-1 text-xl font-semibold tracking-[-0.05em]">
                    탐색 전용 3D 감각
                  </h2>
                </div>
                <Orbit className="size-5 text-signal" />
              </div>
              <div className="relative h-48 rounded-3xl border border-white/10 bg-black">
                <div className="absolute left-1/2 top-1/2 size-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-signal/25 bg-signal/10 blur-sm" />
                <div className="absolute left-[22%] top-[30%] size-3 rounded-full bg-source shadow-[0_0_28px_rgba(125,211,252,0.9)]" />
                <div className="absolute left-[64%] top-[42%] size-2 rounded-full bg-ai shadow-[0_0_24px_rgba(196,181,253,0.9)]" />
                <div className="absolute left-[48%] top-[68%] size-2.5 rounded-full bg-signal shadow-[0_0_30px_rgba(214,255,107,0.9)]" />
                <div className="absolute inset-x-7 top-1/2 h-px rotate-[-16deg] bg-white/15" />
              </div>
              <p className="mt-3 text-xs leading-5 text-muted">
                MVP에서는 복잡한 3D 편집기가 아니라 클러스터 탐색, 검색 반영,
                선택 경험만 담당합니다.
              </p>
            </section>

            <section className="rounded-[2rem] border border-line bg-panel/80 p-4">
              <div className="mb-3 flex items-center gap-2">
                <Search className="size-4 text-signal" />
                <h2 className="font-semibold">검색 / 상세 패널</h2>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/50 px-3 py-3 text-sm text-zinc-300">
                “지난주 회의에서 PPT export 관련 결정이 뭐였지?”
              </div>
              <div className="mt-3 space-y-2">
                {detailRows.map(([label, value]) => (
                  <div
                    className="rounded-2xl border border-white/10 bg-white/[0.035] p-3"
                    key={label}
                  >
                    <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted">
                      {label}
                    </p>
                    <p className="mt-1 text-sm text-zinc-200">{value}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[2rem] border border-line bg-panel/80 p-4">
              <div className="mb-3 flex items-center gap-2">
                <Layers3 className="size-4 text-ai" />
                <h2 className="font-semibold">Export 준비</h2>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3">
                  <Brackets className="mb-2 size-4 text-source" />
                  HTML / PDF
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3">
                  <FileText className="mb-2 size-4 text-ai" />
                  PPT 이후 확장
                </div>
              </div>
            </section>
          </aside>
        </div>
      </section>
    </main>
  );
}
