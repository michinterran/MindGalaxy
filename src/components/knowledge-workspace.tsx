"use client";

import { useMemo, useState } from "react";
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  type Edge,
  type Node,
  type NodeProps,
} from "reactflow";
import { Canvas } from "@react-three/fiber";
import { Line, OrbitControls, Stars, Text } from "@react-three/drei";
import {
  Archive,
  CheckCircle2,
  CircleDot,
  Download,
  FileText,
  FolderOpen,
  Home,
  Inbox,
  LayoutList,
  LogOut,
  Map,
  Maximize2,
  Network,
  Orbit,
  PanelRight,
  Plus,
  Search,
  Settings,
  Sparkles,
  Workflow,
  ZoomIn,
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

type ViewMode = "mindmap" | "galaxy" | "list";
type NodeTone = "source" | "ai" | "topic" | "evidence" | "context" | "action";

type GraphNode = {
  id: string;
  title: string;
  eyebrow: string;
  summary: string;
  tone: NodeTone;
  confidence?: string;
  position: { x: number; y: number };
};

type GraphEdge = {
  source: string;
  target: string;
  tone?: NodeTone;
};

const graphNodes: GraphNode[] = [
  {
    id: "root",
    title: "AI 검색 서비스 MVP 방향",
    eyebrow: "원문",
    summary: "붙여넣은 답변과 회의 메모를 원문 그대로 보존한 출발점",
    tone: "source",
    confidence: "source",
    position: { x: 40, y: 250 },
  },
  {
    id: "problem",
    title: "사용자 문제",
    eyebrow: "주제",
    summary: "Obsidian식 수동 정리는 일반 사용자에게 너무 무겁다",
    tone: "topic",
    confidence: "92%",
    position: { x: 360, y: 60 },
  },
  {
    id: "capture",
    title: "붙여넣기 중심",
    eyebrow: "기능",
    summary: "복사 버튼을 누른 뒤 제목 없이 바로 저장한다",
    tone: "ai",
    confidence: "88%",
    position: { x: 360, y: 178 },
  },
  {
    id: "search",
    title: "근거 기반 검색",
    eyebrow: "검색",
    summary: "답변은 원문 snippet과 연결된 노드가 있을 때만 신뢰 표시",
    tone: "evidence",
    confidence: "85%",
    position: { x: 360, y: 296 },
  },
  {
    id: "context",
    title: "시간 · 장소 · 사람",
    eyebrow: "맥락",
    summary: "회의, 프로젝트, 장소, 사람을 분리해 나중에 다시 찾는다",
    tone: "context",
    confidence: "81%",
    position: { x: 360, y: 414 },
  },
  {
    id: "export",
    title: "PDF · PPT · HTML",
    eyebrow: "재사용",
    summary: "정리된 마인드맵을 문서와 발표 자료로 꺼낸다",
    tone: "action",
    confidence: "planned",
    position: { x: 360, y: 532 },
  },
  {
    id: "plain-map",
    title: "익숙한 마인드맵",
    eyebrow: "UI",
    summary: "기본 보기는 좌우 계층형으로 안정적으로 보여준다",
    tone: "topic",
    confidence: "MVP",
    position: { x: 700, y: 116 },
  },
  {
    id: "galaxy",
    title: "갤럭시 탐색",
    eyebrow: "3D",
    summary: "같은 graph data를 우주적 탐색 화면으로 전환한다",
    tone: "ai",
    confidence: "beta",
    position: { x: 700, y: 236 },
  },
  {
    id: "evidence",
    title: "원문 근거 유지",
    eyebrow: "신뢰",
    summary: "AI 요약과 원문을 분리하고 출처를 바로 확인한다",
    tone: "evidence",
    confidence: "required",
    position: { x: 700, y: 356 },
  },
  {
    id: "next",
    title: "다음 행동",
    eyebrow: "액션",
    summary: "캡처 저장 후 분석 job, 연결 후보, export 순서로 확장",
    tone: "action",
    confidence: "ready",
    position: { x: 700, y: 476 },
  },
];

const graphEdges: GraphEdge[] = [
  { source: "root", target: "problem", tone: "topic" },
  { source: "root", target: "capture", tone: "ai" },
  { source: "root", target: "search", tone: "evidence" },
  { source: "root", target: "context", tone: "context" },
  { source: "root", target: "export", tone: "action" },
  { source: "capture", target: "plain-map", tone: "topic" },
  { source: "capture", target: "galaxy", tone: "ai" },
  { source: "search", target: "evidence", tone: "evidence" },
  { source: "export", target: "next", tone: "action" },
];

const toneLabel: Record<NodeTone, string> = {
  source: "Source",
  ai: "AI",
  topic: "Topic",
  evidence: "Evidence",
  context: "Context",
  action: "Action",
};

const toneColor: Record<NodeTone, string> = {
  source: "#7dd3fc",
  ai: "#c4b5fd",
  topic: "#f4f4f5",
  evidence: "#67e8f9",
  context: "#fde68a",
  action: "#d6ff6b",
};

const galaxyPositions: Record<string, [number, number, number]> = {
  root: [0, 0, 0],
  problem: [-2.3, 1.35, -0.5],
  capture: [1.9, 1.1, 0.4],
  search: [-1.8, -1.25, 1.1],
  context: [2.2, -1.05, -0.8],
  export: [0.35, -2.0, 0.8],
  "plain-map": [3.2, 1.6, 0.1],
  galaxy: [3.6, 0.4, 1.1],
  evidence: [-3.4, -0.8, 0.3],
  next: [1.5, -2.8, -0.2],
};

const nodeTypes = {
  mindNode: MindMapNode,
};

function formatDate(date: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

function getNode(id: string) {
  return graphNodes.find((node) => node.id === id) ?? graphNodes[0];
}

function getToneClass(tone: NodeTone) {
  return `mind-node--${tone}`;
}

function MindMapNode({ data }: NodeProps<GraphNode & { selected?: boolean }>) {
  return (
    <article
      className={`mind-node ${getToneClass(data.tone)} ${
        data.selected ? "mind-node--selected" : ""
      }`}
    >
      <Handle
        className="mind-node__handle"
        position={Position.Left}
        type="target"
      />
      <div className="mind-node__stripe" />
      <div className="mind-node__body">
        <div className="mind-node__topline">
          <span>{data.eyebrow}</span>
          {data.confidence ? <span>{data.confidence}</span> : null}
        </div>
        <h3>{data.title}</h3>
        <p>{data.summary}</p>
      </div>
      <Handle
        className="mind-node__handle"
        position={Position.Right}
        type="source"
      />
    </article>
  );
}

function Sidebar({
  captureCount,
  recentCaptures,
  userEmail,
}: Pick<
  KnowledgeWorkspaceProps,
  "captureCount" | "recentCaptures" | "userEmail"
>) {
  const navigation = [
    { label: "홈", icon: Home, active: true },
    { label: "Inbox", icon: Inbox },
    { label: "지식지도", icon: Network },
    { label: "검색", icon: Search },
    { label: "내보내기", icon: Download },
  ];

  return (
    <aside className="app-sidebar">
      <div className="brand-lockup">
        <div className="brand-mark">
          <Sparkles className="size-5" />
        </div>
        <div>
          <p>MindGalaxy</p>
          <strong>개인 지식지도</strong>
        </div>
      </div>

      <button className="sidebar-action" type="button">
        <Plus className="size-4" />
        새 자료
      </button>

      <nav className="sidebar-nav" aria-label="MindGalaxy navigation">
        {navigation.map((item) => {
          const Icon = item.icon;

          return (
            <button
              className={item.active ? "is-active" : ""}
              key={item.label}
              type="button"
            >
              <Icon className="size-4" />
              <span>{item.label}</span>
              {item.label === "Inbox" ? <em>{captureCount}</em> : null}
            </button>
          );
        })}
      </nav>

      <section className="sidebar-section">
        <div className="sidebar-section__title">
          <FolderOpen className="size-4" />
          최근 캡처
        </div>
        <div className="recent-list">
          {recentCaptures.slice(0, 4).map((capture) => (
            <button key={capture.id} type="button">
              <span>{capture.title ?? "제목 없는 캡처"}</span>
              <small>
                {capture.rawTextLength.toLocaleString()}자 ·{" "}
                {formatDate(capture.createdAt)}
              </small>
            </button>
          ))}
          {!recentCaptures.length ? (
            <p className="empty-note">첫 캡처가 여기에 표시됩니다.</p>
          ) : null}
        </div>
      </section>

      <div className="sidebar-footer">
        <button className="icon-button" title="설정" type="button">
          <Settings className="size-4" />
        </button>
        <div className="user-chip" title={userEmail ?? undefined}>
          {userEmail ?? "user"}
        </div>
        <form action={signOut}>
          <button className="icon-button" title="로그아웃" type="submit">
            <LogOut className="size-4" />
          </button>
        </form>
      </div>
    </aside>
  );
}

function WorkspaceToolbar({
  current,
  onChange,
  workspaceName,
}: {
  current: ViewMode;
  onChange: (mode: ViewMode) => void;
  workspaceName: string;
}) {
  const tabs: Array<{ id: ViewMode; label: string; icon: typeof Map }> = [
    { id: "mindmap", label: "Mind Map", icon: Map },
    { id: "galaxy", label: "Galaxy", icon: Orbit },
    { id: "list", label: "List", icon: LayoutList },
  ];

  return (
    <header className="workspace-toolbar">
      <div className="workspace-title">
        <p>{workspaceName}</p>
        <h1>AI 지식지도</h1>
      </div>

      <div className="toolbar-search">
        <Search className="size-4" />
        <input placeholder="자료, 주제, 사람, 결정 검색" type="search" />
      </div>

      <div className="view-switch" role="tablist" aria-label="View mode">
        {tabs.map((tab) => {
          const Icon = tab.icon;

          return (
            <button
              aria-selected={current === tab.id}
              className={current === tab.id ? "is-active" : ""}
              key={tab.id}
              onClick={() => onChange(tab.id)}
              role="tab"
              type="button"
            >
              <Icon className="size-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      <div className="toolbar-tools" aria-label="Canvas tools">
        <button className="icon-button" title="맞춤 보기" type="button">
          <Maximize2 className="size-4" />
        </button>
        <button className="icon-button" title="확대" type="button">
          <ZoomIn className="size-4" />
        </button>
        <button className="icon-button" title="인스펙터" type="button">
          <PanelRight className="size-4" />
        </button>
      </div>
    </header>
  );
}

function MindMapCanvas({
  selectedId,
  onSelect,
  isSample = false,
}: {
  selectedId: string;
  onSelect: (id: string) => void;
  isSample?: boolean;
}) {
  const nodes: Node[] = useMemo(
    () =>
      graphNodes.map((node) => ({
        id: node.id,
        type: "mindNode",
        position: node.position,
        data: {
          ...node,
          selected: selectedId === node.id,
        },
        draggable: true,
      })),
    [selectedId],
  );

  const edges: Edge[] = useMemo(
    () =>
      graphEdges.map((edge) => ({
        id: `${edge.source}-${edge.target}`,
        source: edge.source,
        target: edge.target,
        type: "bezier",
        style: {
          stroke: toneColor[edge.tone ?? "source"],
          strokeOpacity: 0.5,
          strokeWidth: edge.source === "root" ? 2 : 1.35,
        },
      })),
    [],
  );

  return (
    <section className="canvas-stage" aria-label="Mind map canvas">
      <div className="canvas-stage__header">
        <div>
          <p>{isSample ? "Sample graph" : "Workspace graph"}</p>
          <h2>{isSample ? "첫 저장 후 생성될 구조" : "마인드맵"}</h2>
        </div>
        <div className="graph-legend">
          {(["source", "ai", "evidence", "context", "action"] as NodeTone[]).map(
            (tone) => (
              <span key={tone}>
                <i style={{ backgroundColor: toneColor[tone] }} />
                {toneLabel[tone]}
              </span>
            ),
          )}
        </div>
      </div>
      <ReactFlow
        edges={edges}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        maxZoom={1.35}
        minZoom={0.38}
        nodes={nodes}
        nodeTypes={nodeTypes}
        onNodeClick={(_, node) => onSelect(node.id)}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          color="rgba(255,255,255,0.12)"
          gap={32}
          variant={BackgroundVariant.Lines}
        />
        <Controls showInteractive={false} />
      </ReactFlow>
    </section>
  );
}

function GalaxyScene() {
  return (
    <>
      <ambientLight intensity={0.55} />
      <pointLight color="#d6ff6b" intensity={9} position={[0, 0, 5]} />
      <Stars
        depth={55}
        factor={3}
        fade
        radius={80}
        saturation={0}
        speed={0.22}
      />
      {graphEdges.map((edge) => (
        <Line
          color={toneColor[edge.tone ?? "source"]}
          key={`${edge.source}-${edge.target}`}
          lineWidth={1}
          opacity={0.36}
          points={[galaxyPositions[edge.source], galaxyPositions[edge.target]]}
          transparent
        />
      ))}
      {graphNodes.map((node) => {
        const color = toneColor[node.tone];
        const isRoot = node.id === "root";

        return (
          <group key={node.id} position={galaxyPositions[node.id]}>
            <mesh>
              <sphereGeometry args={[isRoot ? 0.46 : 0.2, 36, 36]} />
              <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={isRoot ? 0.82 : 0.48}
                roughness={0.4}
              />
            </mesh>
            <Text
              anchorX="center"
              anchorY="middle"
              color="#f4f4f5"
              fontSize={isRoot ? 0.17 : 0.13}
              position={[0, isRoot ? 0.72 : 0.38, 0]}
            >
              {node.eyebrow}
            </Text>
          </group>
        );
      })}
      <OrbitControls
        autoRotate
        autoRotateSpeed={0.28}
        enableDamping
        maxDistance={8}
        minDistance={3}
      />
    </>
  );
}

function GalaxyView() {
  return (
    <section className="galaxy-stage" aria-label="Galaxy view">
      <Canvas camera={{ position: [0, 0, 6], fov: 54 }}>
        <GalaxyScene />
      </Canvas>
      <div className="galaxy-hud">
        <p>Galaxy Beta</p>
        <h2>같은 데이터를 우주형 탐색으로 전환</h2>
      </div>
    </section>
  );
}

function ListView({ recentCaptures }: { recentCaptures: RecentCapture[] }) {
  return (
    <section className="list-stage">
      <div className="list-stage__header">
        <div>
          <p>Capture list</p>
          <h2>저장된 원문</h2>
        </div>
        <button className="secondary-button" type="button">
          <Archive className="size-4" />
          보관함
        </button>
      </div>
      <div className="capture-table">
        {(recentCaptures.length ? recentCaptures : []).map((capture) => (
          <article key={capture.id}>
            <FileText className="size-4" />
            <div>
              <h3>{capture.title ?? "제목 없는 캡처"}</h3>
              <p>
                {capture.sourceKind} · {capture.rawTextLength.toLocaleString()}자 ·{" "}
                {formatDate(capture.createdAt)}
              </p>
            </div>
            <span>queued</span>
          </article>
        ))}
        {!recentCaptures.length ? (
          <div className="empty-table">아직 저장된 캡처가 없습니다.</div>
        ) : null}
      </div>
    </section>
  );
}

function Inspector({
  captureCount,
  selectedId,
}: {
  captureCount: number;
  selectedId: string;
}) {
  const node = getNode(selectedId);
  const linkedNodes = graphEdges
    .filter((edge) => edge.source === selectedId || edge.target === selectedId)
    .map((edge) => getNode(edge.source === selectedId ? edge.target : edge.source));

  return (
    <aside className="inspector-panel">
      <section className="inspector-section">
        <div className="inspector-heading">
          <p>Selected node</p>
          <h2>{node.title}</h2>
        </div>
        <div className={`node-type-badge ${getToneClass(node.tone)}`}>
          <CircleDot className="size-4" />
          {toneLabel[node.tone]}
        </div>
        <p className="inspector-summary">{node.summary}</p>
      </section>

      <section className="inspector-section">
        <div className="inspector-heading">
          <p>Evidence</p>
          <h2>원문 근거</h2>
        </div>
        <blockquote>
          “ChatGPT 답변을 그냥 붙여넣기 하면 시간, 장소, 주제 등의 컨텍스트를
          AI가 이해해서 적절하게 배치하고 다시 검색해준다.”
        </blockquote>
      </section>

      <section className="inspector-section">
        <div className="inspector-heading">
          <p>Connections</p>
          <h2>연결된 노드</h2>
        </div>
        <div className="connection-list">
          {linkedNodes.map((item) => (
            <div key={item.id}>
              <span style={{ backgroundColor: toneColor[item.tone] }} />
              <p>{item.title}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="inspector-section inspector-section--metrics">
        <div>
          <CheckCircle2 className="size-4" />
          <span>캡처</span>
          <strong>{captureCount}</strong>
        </div>
        <div>
          <Workflow className="size-4" />
          <span>샘플 노드</span>
          <strong>{graphNodes.length}</strong>
        </div>
      </section>
    </aside>
  );
}

function EmptyWorkspace({
  workspaceId,
  selectedId,
  onSelect,
}: {
  workspaceId: string;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="workspace-stack">
      <CapturePanel workspaceId={workspaceId} variant="hero" />
      <MindMapCanvas isSample onSelect={onSelect} selectedId={selectedId} />
    </div>
  );
}

function ActiveWorkspace({
  viewMode,
  recentCaptures,
  selectedId,
  onSelect,
}: {
  viewMode: ViewMode;
  recentCaptures: RecentCapture[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  if (viewMode === "galaxy") return <GalaxyView />;
  if (viewMode === "list") return <ListView recentCaptures={recentCaptures} />;

  return <MindMapCanvas onSelect={onSelect} selectedId={selectedId} />;
}

export function KnowledgeWorkspace(props: KnowledgeWorkspaceProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("mindmap");
  const [selectedId, setSelectedId] = useState("root");
  const isEmpty = props.captureCount === 0;

  return (
    <main className="mindgalaxy-app">
      <Sidebar
        captureCount={props.captureCount}
        recentCaptures={props.recentCaptures}
        userEmail={props.userEmail}
      />
      <section className="workspace-shell">
        <WorkspaceToolbar
          current={viewMode}
          onChange={setViewMode}
          workspaceName={props.workspace.name}
        />
        <div className="workspace-grid">
          {isEmpty ? (
            <EmptyWorkspace
              onSelect={setSelectedId}
              selectedId={selectedId}
              workspaceId={props.workspace.id}
            />
          ) : (
            <ActiveWorkspace
              onSelect={setSelectedId}
              recentCaptures={props.recentCaptures}
              selectedId={selectedId}
              viewMode={viewMode}
            />
          )}
          <Inspector captureCount={props.captureCount} selectedId={selectedId} />
        </div>
      </section>
    </main>
  );
}
