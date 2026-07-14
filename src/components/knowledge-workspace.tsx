"use client";

import { useMemo, useState } from "react";
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  Position,
  type Edge,
  type Node,
} from "reactflow";
import { Canvas } from "@react-three/fiber";
import { Line, OrbitControls, Stars, Text } from "@react-three/drei";
import {
  ArrowRight,
  Brain,
  Brackets,
  FileText,
  Inbox,
  Layers3,
  ListTree,
  LogOut,
  Map,
  Orbit,
  Search,
  Sparkles,
  Telescope,
} from "lucide-react";
import { signOut } from "@/app/auth/actions";
import { CapturePanel } from "@/components/capture-panel";

type RecentCapture = {
  id: string;
  title: string | null;
  rawTextLength: number;
  sourceKind: string;
  createdAt: string;
};

type KnowledgeWorkspaceProps = {
  workspace: {
    id: string;
    name: string;
  };
  userEmail?: string | null;
  captureCount: number;
  recentCaptures: RecentCapture[];
};

type ViewMode = "mindmap" | "galaxy" | "list" | "search";

const graphNodes = [
  {
    id: "capture",
    label: "AI 검색 전략 메모",
    caption: "붙여넣은 원문",
    kind: "원문",
    tone: "source",
    summary: "ChatGPT 답변과 회의 메모를 원문 그대로 보존한 시작점입니다.",
  },
  {
    id: "summary",
    label: "핵심 요약",
    caption: "3줄 요약",
    kind: "요약",
    tone: "summary",
    summary: "MVP는 붙여넣기, 자동 구조화, 근거 기반 검색 경험을 우선합니다.",
  },
  {
    id: "topic",
    label: "주요 주제",
    caption: "AI 지식 저장소",
    kind: "주제",
    tone: "topic",
    summary: "Obsidian보다 쉬운 자동 마인드맵과 갤럭시 탐색이 핵심입니다.",
  },
  {
    id: "evidence",
    label: "근거",
    caption: "원문 snippet",
    kind: "근거",
    tone: "evidence",
    summary: "모든 검색 답변과 요약은 원문 조각을 함께 보여줘야 합니다.",
  },
  {
    id: "context",
    label: "시간 · 장소 · 사람",
    caption: "context 추출",
    kind: "맥락",
    tone: "context",
    summary: "AI가 시간, 장소, 사람, 조직, 프로젝트 정보를 분리합니다.",
  },
  {
    id: "task",
    label: "다음 행동",
    caption: "할 일",
    kind: "할 일",
    tone: "task",
    summary: "정리된 내용을 PDF, HTML, PPT로 내보낼 수 있게 확장합니다.",
  },
] as const;

const graphEdges = [
  ["capture", "summary", "요약"],
  ["capture", "topic", "주제"],
  ["capture", "evidence", "근거"],
  ["topic", "context", "맥락"],
  ["summary", "task", "후속"],
] as const;

const toneClass: Record<(typeof graphNodes)[number]["tone"], string> = {
  source: "border-source/45 bg-source/10 text-source shadow-source/10",
  summary: "border-ai/45 bg-ai/10 text-ai shadow-ai/10",
  topic: "border-blue-300/45 bg-blue-300/10 text-blue-200 shadow-blue-300/10",
  evidence: "border-cyan-300/45 bg-cyan-300/10 text-cyan-200 shadow-cyan-300/10",
  context: "border-amber-200/45 bg-amber-200/10 text-amber-100 shadow-amber-200/10",
  task: "border-signal/45 bg-signal/10 text-signal shadow-signal/10",
};

const flowNodes: Node[] = [
  {
    id: "capture",
    position: { x: 40, y: 210 },
    sourcePosition: Position.Right,
    data: {
      label: <MindMapNode id="capture" />,
    },
    type: "default",
    className: "!w-[230px] !border-none !bg-transparent !p-0 !shadow-none",
  },
  {
    id: "summary",
    position: { x: 390, y: 40 },
    targetPosition: Position.Left,
    data: { label: <MindMapNode id="summary" /> },
    className: "!w-[230px] !border-none !bg-transparent !p-0 !shadow-none",
  },
  {
    id: "topic",
    position: { x: 410, y: 220 },
    targetPosition: Position.Left,
    sourcePosition: Position.Right,
    data: { label: <MindMapNode id="topic" /> },
    className: "!w-[230px] !border-none !bg-transparent !p-0 !shadow-none",
  },
  {
    id: "evidence",
    position: { x: 390, y: 405 },
    targetPosition: Position.Left,
    data: { label: <MindMapNode id="evidence" /> },
    className: "!w-[230px] !border-none !bg-transparent !p-0 !shadow-none",
  },
  {
    id: "context",
    position: { x: 760, y: 150 },
    targetPosition: Position.Left,
    data: { label: <MindMapNode id="context" /> },
    className: "!w-[230px] !border-none !bg-transparent !p-0 !shadow-none",
  },
  {
    id: "task",
    position: { x: 760, y: 330 },
    targetPosition: Position.Left,
    data: { label: <MindMapNode id="task" /> },
    className: "!w-[230px] !border-none !bg-transparent !p-0 !shadow-none",
  },
];

const flowEdges: Edge[] = graphEdges.map(([source, target, label]) => ({
  id: `${source}-${target}`,
  source,
  target,
  label,
  type: "smoothstep",
  animated: target === "task",
  markerEnd: {
    type: MarkerType.ArrowClosed,
    color: target === "task" ? "#d6ff6b" : "#7dd3fc",
  },
  style: {
    stroke: target === "task" ? "#d6ff6b" : "#7dd3fc",
    strokeOpacity: 0.55,
    strokeWidth: 1.4,
  },
  labelStyle: {
    fill: "#a1a1aa",
    fontSize: 11,
    letterSpacing: 1,
  },
}));

const galaxyPositions: Record<string, [number, number, number]> = {
  capture: [0, 0, 0],
  summary: [-2.8, 1.4, -0.8],
  topic: [2.7, 0.7, 0.6],
  evidence: [1.5, -1.7, -1.1],
  context: [-1.8, -1.25, 1.2],
  task: [3.2, -1.6, 1.4],
};

function formatDate(date: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

function findNode(id: string) {
  return graphNodes.find((node) => node.id === id) ?? graphNodes[0];
}

function MindMapNode({ id }: { id: string }) {
  const node = findNode(id);

  return (
    <article
      className={`rounded-[1.35rem] border p-4 shadow-2xl backdrop-blur-xl ${toneClass[node.tone]}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] opacity-70">
            {node.kind}
          </p>
          <h3 className="mt-1 text-base font-semibold tracking-[-0.04em] text-zinc-50">
            {node.label}
          </h3>
        </div>
        <div className="rounded-full border border-white/10 bg-black/35 px-2 py-1 text-[10px]">
          {node.caption}
        </div>
      </div>
      <p className="mt-3 text-xs leading-5 text-zinc-300">{node.summary}</p>
    </article>
  );
}

function Header({
  workspace,
  userEmail,
}: Pick<KnowledgeWorkspaceProps, "workspace" | "userEmail">) {
  return (
    <header className="flex items-center justify-between rounded-[2rem] border border-line bg-white/[0.035] px-5 py-4 shadow-2xl shadow-black/40 backdrop-blur">
      <div className="flex items-center gap-3">
        <div className="grid size-10 place-items-center rounded-2xl border border-white/15 bg-white/10">
          <Brain className="size-5 text-signal" />
        </div>
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.34em] text-muted">
            MindGalaxy
          </p>
          <h1 className="text-lg font-semibold tracking-[-0.03em]">
            붙여넣는 순간 정리되는 개인 지식지도
          </h1>
        </div>
      </div>

      <div className="hidden items-center gap-3 sm:flex">
        <div className="rounded-full border border-line bg-black/30 px-3 py-2 text-xs text-muted">
          {workspace.name} · {userEmail}
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
  );
}

function ViewTabs({
  current,
  onChange,
}: {
  current: ViewMode;
  onChange: (mode: ViewMode) => void;
}) {
  const tabs: Array<{
    id: ViewMode;
    label: string;
    icon: typeof Map;
    badge?: string;
  }> = [
    { id: "mindmap", label: "Mind Map", icon: Map },
    { id: "galaxy", label: "Galaxy", icon: Orbit, badge: "Beta" },
    { id: "list", label: "List", icon: ListTree },
    { id: "search", label: "Search", icon: Search },
  ];

  return (
    <div className="flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-black/35 p-1">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = current === tab.id;

        return (
          <button
            className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition ${
              active
                ? "bg-zinc-50 text-black shadow-lg shadow-white/10"
                : "text-muted hover:bg-white/[0.06] hover:text-zinc-100"
            }`}
            key={tab.id}
            onClick={() => onChange(tab.id)}
            type="button"
          >
            <Icon className="size-3.5" />
            {tab.label}
            {tab.badge ? (
              <span className="rounded-full bg-signal/20 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.2em] text-signal">
                {tab.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function EmptyOnboarding({
  workspaceId,
}: {
  workspaceId: string;
}) {
  return (
    <div className="grid flex-1 gap-5 py-5 xl:grid-cols-[minmax(420px,0.8fr)_minmax(0,1.2fr)]">
      <section className="flex flex-col justify-center rounded-[2.5rem] border border-line bg-panel/70 p-5 shadow-2xl shadow-black/45">
        <div className="mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-signal/25 bg-signal/10 px-3 py-2 text-xs font-semibold text-signal">
          <Sparkles className="size-4" /> 첫 지식지도 만들기
        </div>
        <h2 className="max-w-3xl text-4xl font-semibold tracking-[-0.08em] text-zinc-50 md:text-6xl">
          복사한 답변을
          <br />
          익숙한 마인드맵으로.
        </h2>
        <p className="mt-5 max-w-2xl text-sm leading-7 text-muted md:text-base">
          ChatGPT, Claude, Gemini 답변이나 회의 메모를 그대로 붙여넣으세요.
          MindGalaxy는 원문을 먼저 보존하고, 요약·주제·근거·시간·장소를
          분리해 같은 데이터를 마인드맵과 갤럭시로 보여줍니다.
        </p>
        <div className="mt-7 grid gap-3 sm:grid-cols-3">
          {[
            ["1", "붙여넣기", "복사 버튼 누르고 그대로 붙여넣기"],
            ["2", "AI 정리", "요약, 주제, 근거, 맥락으로 분해"],
            ["3", "탐색", "Mind Map 기본, Galaxy는 몰입 탐색"],
          ].map(([step, title, body]) => (
            <div
              className="rounded-3xl border border-white/10 bg-white/[0.035] p-4"
              key={step}
            >
              <p className="font-mono text-[10px] text-source">STEP {step}</p>
              <p className="mt-2 font-semibold">{title}</p>
              <p className="mt-2 text-xs leading-5 text-muted">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-5">
        <CapturePanel workspaceId={workspaceId} variant="hero" />
        <section className="rounded-[2rem] border border-line bg-black/40 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-ai">
                Sample Output
              </p>
              <h3 className="mt-1 text-xl font-semibold tracking-[-0.05em]">
                첫 저장 후 이런 구조로 보입니다
              </h3>
            </div>
            <ArrowRight className="size-5 text-signal" />
          </div>
          <MiniMindMap />
        </section>
      </div>
    </div>
  );
}

function MiniMindMap() {
  return (
    <div className="relative h-72 overflow-hidden rounded-[1.75rem] border border-white/10 bg-[radial-gradient(circle_at_50%_50%,rgba(214,255,107,0.09),transparent_34%),linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[length:auto,38px_38px,38px_38px]">
      <div className="absolute left-[8%] top-[42%] h-px w-[30%] bg-source/35" />
      <div className="absolute left-[48%] top-[26%] h-px w-[28%] rotate-[22deg] bg-ai/35" />
      <div className="absolute left-[48%] top-[59%] h-px w-[25%] -rotate-[19deg] bg-signal/35" />
      {[
        ["원문", "left-[8%] top-[34%]", "source"],
        ["요약", "left-[39%] top-[20%]", "summary"],
        ["주제", "left-[39%] top-[50%]", "topic"],
        ["근거", "left-[72%] top-[31%]", "evidence"],
        ["맥락", "left-[70%] top-[62%]", "context"],
      ].map(([label, position, tone]) => (
        <div
          className={`absolute rounded-2xl border px-4 py-3 text-sm font-semibold shadow-2xl ${position} ${
            toneClass[tone as keyof typeof toneClass]
          }`}
          key={label}
        >
          {label}
        </div>
      ))}
    </div>
  );
}

function MindMapView() {
  return (
    <div className="h-full min-h-[680px] overflow-hidden rounded-[2rem] border border-line bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.012))]">
      <ReactFlow
        defaultEdges={flowEdges}
        defaultNodes={flowNodes}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        maxZoom={1.35}
        minZoom={0.45}
        nodesDraggable
        proOptions={{ hideAttribution: true }}
      >
        <Background
          color="rgba(255,255,255,0.14)"
          gap={36}
          variant={BackgroundVariant.Dots}
        />
        <Controls
          className="!border-line !bg-black/70 !text-zinc-100"
          showInteractive={false}
        />
      </ReactFlow>
    </div>
  );
}

function GalaxyScene() {
  return (
    <>
      <ambientLight intensity={0.65} />
      <pointLight color="#d6ff6b" intensity={8} position={[0, 0, 4]} />
      <Stars
        depth={44}
        factor={4}
        fade
        radius={70}
        saturation={0}
        speed={0.35}
      />
      {graphEdges.map(([source, target]) => (
        <Line
          color="#7dd3fc"
          key={`${source}-${target}`}
          lineWidth={1}
          opacity={0.35}
          points={[galaxyPositions[source], galaxyPositions[target]]}
          transparent
        />
      ))}
      {graphNodes.map((node) => {
        const position = galaxyPositions[node.id];
        const isCore = node.id === "capture";
        const color =
          node.tone === "task"
            ? "#d6ff6b"
            : node.tone === "summary"
              ? "#c4b5fd"
              : node.tone === "context"
                ? "#fde68a"
                : "#7dd3fc";

        return (
          <group key={node.id} position={position}>
            <mesh>
              <sphereGeometry args={[isCore ? 0.42 : 0.22, 32, 32]} />
              <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={isCore ? 0.78 : 0.55}
                roughness={0.45}
              />
            </mesh>
            <Text
              anchorX="center"
              anchorY="middle"
              color="#f4f4f5"
              fontSize={0.16}
              position={[0, isCore ? 0.72 : 0.42, 0]}
            >
              {node.kind}
            </Text>
          </group>
        );
      })}
      <OrbitControls
        autoRotate
        autoRotateSpeed={0.35}
        enableDamping
        maxDistance={8}
        minDistance={3}
      />
    </>
  );
}

function GalaxyView() {
  return (
    <div className="relative h-full min-h-[680px] overflow-hidden rounded-[2rem] border border-line bg-black">
      <div className="absolute left-5 top-5 z-10 max-w-sm rounded-3xl border border-white/10 bg-black/55 p-4 backdrop-blur-xl">
        <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-signal">
          Galaxy Beta
        </p>
        <h3 className="mt-2 text-xl font-semibold tracking-[-0.05em]">
          같은 데이터를 우주처럼 탐색
        </h3>
        <p className="mt-2 text-xs leading-5 text-muted">
          중심 별은 원문, 큰 행성은 주제/요약, 연결선은 근거 관계입니다.
        </p>
      </div>
      <Canvas camera={{ position: [0, 0, 6], fov: 54 }}>
        <GalaxyScene />
      </Canvas>
    </div>
  );
}

function ListView({ recentCaptures }: { recentCaptures: RecentCapture[] }) {
  return (
    <div className="min-h-[680px] rounded-[2rem] border border-line bg-panel/76 p-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-source">
        Capture List
      </p>
      <h2 className="mt-2 text-3xl font-semibold tracking-[-0.07em]">
        저장된 원문과 분석 대기열
      </h2>
      <div className="mt-6 grid gap-3">
        {(recentCaptures.length ? recentCaptures : []).map((capture) => (
          <article
            className="rounded-3xl border border-white/10 bg-white/[0.035] p-4"
            key={capture.id}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-semibold">
                  {capture.title ?? "제목 없는 캡처"}
                </h3>
                <p className="mt-2 text-xs text-muted">
                  {capture.sourceKind} · 원문 {capture.rawTextLength.toLocaleString()}자
                  · {formatDate(capture.createdAt)}
                </p>
              </div>
              <span className="rounded-full border border-ai/25 bg-ai/10 px-3 py-1 font-mono text-[10px] text-ai">
                queued
              </span>
            </div>
          </article>
        ))}
        {!recentCaptures.length ? (
          <div className="rounded-3xl border border-dashed border-white/12 p-8 text-center text-muted">
            아직 저장된 캡처가 없습니다. 첫 자료를 붙여넣으면 여기에 쌓입니다.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SearchView() {
  return (
    <div className="min-h-[680px] rounded-[2rem] border border-line bg-panel/76 p-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-signal">
        Grounded Search
      </p>
      <h2 className="mt-2 text-3xl font-semibold tracking-[-0.07em]">
        나중에 다시 묻기 위한 검색 경험
      </h2>
      <div className="mt-6 rounded-[1.75rem] border border-white/10 bg-black/45 p-4 text-zinc-200">
        “지난주 회의에서 PPT export 관련 결정이 뭐였지?”
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {[
          ["Source", "답변은 원문 snippet이 있을 때만 신뢰 표시"],
          ["Context", "시간, 장소, 사람, 프로젝트 단위로 필터"],
          ["Answer", "단정 대신 근거와 함께 짧게 재구성"],
        ].map(([label, body]) => (
          <div
            className="rounded-3xl border border-white/10 bg-white/[0.035] p-4"
            key={label}
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted">
              {label}
            </p>
            <p className="mt-2 text-sm leading-6 text-zinc-200">{body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function InsightPanel({ captureCount }: { captureCount: number }) {
  return (
    <aside className="hidden min-w-0 flex-col gap-4 2xl:flex">
      <section className="rounded-[2rem] border border-line bg-panel/80 p-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-ai">
              Selected Node
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-[-0.05em]">
              핵심 요약
            </h2>
          </div>
          <Telescope className="size-5 text-ai" />
        </div>
        <p className="text-sm leading-6 text-muted">
          노드를 선택하면 이 영역에 요약, 원문 근거, 연결된 맥락이 표시됩니다.
        </p>
        <div className="mt-4 space-y-2">
          {[
            ["저장된 캡처", `${captureCount}개`],
            ["기본 보기", "Mind Map"],
            ["탐색 보기", "Galaxy Beta"],
          ].map(([label, value]) => (
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
          <h2 className="font-semibold">정리본 내보내기</h2>
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
  );
}

function AppWorkspace({
  workspace,
  captureCount,
  recentCaptures,
}: KnowledgeWorkspaceProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("mindmap");

  const View = useMemo(() => {
    if (viewMode === "galaxy") return <GalaxyView />;
    if (viewMode === "list") return <ListView recentCaptures={recentCaptures} />;
    if (viewMode === "search") return <SearchView />;
    return <MindMapView />;
  }, [recentCaptures, viewMode]);

  return (
    <div className="grid flex-1 gap-4 py-4 xl:grid-cols-[340px_minmax(0,1fr)] 2xl:grid-cols-[360px_minmax(0,1fr)_340px]">
      <aside className="flex min-w-0 flex-col gap-4">
        <CapturePanel workspaceId={workspace.id} />

        <section className="rounded-[2rem] border border-line bg-panel/72 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Inbox className="size-4 text-source" />
            <h2 className="font-semibold">최근 저장</h2>
          </div>
          <div className="space-y-2">
            {recentCaptures.slice(0, 4).map((item) => (
              <article
                className="rounded-2xl border border-white/10 bg-white/[0.035] p-3"
                key={item.id}
              >
                <h3 className="text-sm font-medium">
                  {item.title ?? "제목 없는 캡처"}
                </h3>
                <p className="mt-2 text-xs text-muted">
                  원문 {item.rawTextLength.toLocaleString()}자
                </p>
                <p className="mt-1 font-mono text-[11px] text-ai">
                  AI 구조화 대기
                </p>
              </article>
            ))}
          </div>
        </section>
      </aside>

      <section className="min-w-0">
        <div className="mb-4 flex flex-col justify-between gap-3 rounded-[2rem] border border-line bg-white/[0.035] p-4 backdrop-blur md:flex-row md:items-center">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-source">
              One Graph · Multiple Views
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-[-0.06em]">
              기본은 익숙한 마인드맵, 탐색은 갤럭시로
            </h2>
          </div>
          <ViewTabs current={viewMode} onChange={setViewMode} />
        </div>
        {View}
      </section>

      <InsightPanel captureCount={captureCount} />
    </div>
  );
}

export function KnowledgeWorkspace(props: KnowledgeWorkspaceProps) {
  const isEmpty = props.captureCount === 0;

  return (
    <main className="min-h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_14%_8%,rgba(125,211,252,0.16),transparent_28%),radial-gradient(circle_at_80%_0%,rgba(196,181,253,0.13),transparent_30%),radial-gradient(circle_at_55%_72%,rgba(214,255,107,0.07),transparent_30%),linear-gradient(135deg,rgba(255,255,255,0.05)_0_1px,transparent_1px)] bg-[length:auto,auto,auto,34px_34px]" />
      <section className="relative mx-auto flex min-h-screen w-full max-w-[1800px] flex-col px-4 py-4 sm:px-6 lg:px-8">
        <Header workspace={props.workspace} userEmail={props.userEmail} />
        {isEmpty ? (
          <EmptyOnboarding workspaceId={props.workspace.id} />
        ) : (
          <AppWorkspace {...props} />
        )}
      </section>
    </main>
  );
}
