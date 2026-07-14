"use client";

import { Canvas } from "@react-three/fiber";
import { Line, OrbitControls, Stars, Text } from "@react-three/drei";
import {
  GRAPH_TONE_COLORS,
  type GraphProjection,
  type PositionedGraphNode,
} from "@/features/knowledge-map/model/graph";
import { t, type Locale } from "@/lib/i18n";

function findNode(graph: GraphProjection, id: string | null) {
  return graph.nodes.find((node) => node.id === id) ?? null;
}

function rootNode(graph: GraphProjection) {
  return [...graph.nodes].sort(
    (left, right) =>
      right.importance - left.importance ||
      right.degree - left.degree ||
      left.title.localeCompare(right.title),
  )[0];
}

function nodeRadius(node: PositionedGraphNode, isRoot: boolean, isSelected: boolean) {
  return (isRoot ? 0.36 : 0.15) + node.importance * 0.18 + (isSelected ? 0.08 : 0);
}

function GalaxyScene({
  graph,
  onSelect,
  selectedId,
}: {
  graph: GraphProjection;
  onSelect: (id: string) => void;
  selectedId: string | null;
}) {
  const nodes = graph.nodes.slice(0, 80);
  const nodePositions = new Map(
    nodes.map((node) => [node.id, node.galaxyPosition] as const),
  );
  const root = rootNode(graph);

  return (
    <>
      <ambientLight intensity={0.5} />
      <pointLight color="#d6ff6b" intensity={8} position={[0, 0, 5]} />
      <pointLight color="#67e8f9" intensity={3.5} position={[-3, 2, 3]} />
      <Stars depth={55} factor={3} fade radius={80} saturation={0} speed={0.16} />
      {graph.edges.map((edge) => {
        const source = nodePositions.get(edge.sourceNodeId);
        const target = nodePositions.get(edge.targetNodeId);
        const highlighted =
          Boolean(selectedId) &&
          (edge.sourceNodeId === selectedId || edge.targetNodeId === selectedId);

        if (!source || !target) return null;

        return (
          <Line
            color={GRAPH_TONE_COLORS[edge.tone ?? "source"]}
            key={edge.id}
            lineWidth={highlighted ? 2.1 : 0.8}
            opacity={highlighted || !selectedId ? 0.46 : 0.08}
            points={[source, target]}
            transparent
          />
        );
      })}
      {nodes.map((node) => {
        const color = GRAPH_TONE_COLORS[node.tone];
        const isRoot = node.id === root?.id;
        const isSelected = node.id === selectedId;
        const radius = nodeRadius(node, isRoot, isSelected);

        return (
          <group key={node.id} position={node.galaxyPosition}>
            <mesh onClick={(event) => {
              event.stopPropagation();
              onSelect(node.id);
            }}>
              <sphereGeometry args={[radius, 34, 34]} />
              <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={isSelected ? 1.05 : isRoot ? 0.82 : 0.42}
                roughness={0.36}
              />
            </mesh>
            {isSelected || isRoot ? (
              <mesh>
                <sphereGeometry args={[radius * 1.9, 28, 28]} />
                <meshBasicMaterial
                  color={isSelected ? "#d6ff6b" : color}
                  opacity={isSelected ? 0.13 : 0.08}
                  transparent
                  wireframe
                />
              </mesh>
            ) : null}
            <Text
              anchorX="center"
              anchorY="middle"
              color={isSelected ? "#d6ff6b" : "#f4f4f5"}
              fontSize={isRoot ? 0.16 : 0.115}
              position={[0, radius + 0.26, 0]}
            >
              {isRoot || isSelected ? node.title.slice(0, 26) : node.eyebrow}
            </Text>
          </group>
        );
      })}
      <OrbitControls
        autoRotate
        autoRotateSpeed={0.2}
        enableDamping
        maxDistance={8}
        minDistance={3}
      />
    </>
  );
}

export function GalaxyView({
  graph,
  locale,
  onSelect,
  selectedId,
}: {
  graph: GraphProjection;
  locale: Locale;
  onSelect: (id: string) => void;
  selectedId: string | null;
}) {
  const selected = findNode(graph, selectedId) ?? rootNode(graph);

  return (
    <section className="galaxy-stage" aria-label={t(locale, "workspace.graph.galaxyAria")}>
      <Canvas camera={{ position: [0, 0, 6], fov: 54 }}>
        <GalaxyScene graph={graph} onSelect={onSelect} selectedId={selected?.id ?? null} />
      </Canvas>
      <div className="galaxy-hud">
        <p>{t(locale, "workspace.graph.galaxyKicker")}</p>
        <h2>{selected?.title ?? t(locale, "workspace.graph.galaxyTitle")}</h2>
        {selected ? (
          <>
            <span>{selected.eyebrow}</span>
            <small>{selected.summary}</small>
            {selected.evidenceSnippet ? <blockquote>{selected.evidenceSnippet}</blockquote> : null}
          </>
        ) : null}
      </div>
    </section>
  );
}
