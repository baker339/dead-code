"use client";

import { useMemo } from "react";
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { CodeGraphLanguage, CodeGraphV1 } from "@/lib/analysis/code-graph-types";

type FileNodeData = {
  label: string;
  path: string;
  language: CodeGraphLanguage;
  variant: "file" | "module";
};

const LANG_BG: Partial<Record<CodeGraphLanguage, string>> = {
  java: "#fff7ed",
  kotlin: "#fff7ed",
  csharp: "#eef2ff",
  swift: "#ecfeff",
  typescript: "#e0f2fe",
  javascript: "#fef9c3",
  python: "#dcfce7",
  go: "#e0e7ff",
  rust: "#ffe4e6",
  module: "#f4f4f5",
};

function FileNode({ data }: NodeProps<Node<FileNodeData>>) {
  const isModule = data.variant === "module";
  const bg = LANG_BG[data.language] ?? "#ffffff";
  return (
    <div
      className="max-w-[min(280px,85vw)] rounded-lg border border-zinc-300 px-3 py-2 shadow-sm"
      style={{ background: bg }}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-2 !w-2 !border-0 !bg-zinc-400"
      />
      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
        {isModule ? "External / module" : data.language}
      </p>
      <p
        className="text-sm font-semibold leading-tight text-zinc-900"
        title={data.path}
      >
        {isModule ? `📦 ${data.label}` : data.label}
      </p>
      {!isModule && (
        <p
          className="mt-1 line-clamp-3 break-all font-mono text-[11px] leading-snug text-zinc-600"
          title={data.path}
        >
          {data.path}
        </p>
      )}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-2 !w-2 !border-0 !bg-zinc-400"
      />
    </div>
  );
}

const nodeTypes = { fileNode: FileNode };

function toFlowElements(g: CodeGraphV1): { nodes: Node[]; edges: Edge[] } {
  const cols = Math.max(1, Math.ceil(Math.sqrt(g.nodes.length)));
  const nodes: Node[] = g.nodes.map((n, i) => ({
    id: n.id,
    type: "fileNode",
    position: { x: (i % cols) * 220, y: Math.floor(i / cols) * 120 },
    data: {
      label: n.label,
      path: n.path,
      language: n.language,
      variant: n.language === "module" ? "module" : "file",
    },
  }));

  const edges: Edge[] = g.edges.map((e, i) => ({
    id: `e-${i}`,
    source: e.from,
    target: e.to,
    label: e.kind,
    style: { stroke: "#a1a1aa", strokeWidth: 1 },
    labelStyle: { fontSize: 11, fill: "#71717a" },
  }));

  return { nodes, edges };
}

export function CodeGraphView({
  graph,
  repoName,
}: {
  graph: CodeGraphV1;
  repoName: string | null;
}) {
  const initial = useMemo(() => toFlowElements(graph), [graph]);
  const [nodes, , onNodesChange] = useNodesState(initial.nodes);
  const [edges, , onEdgesChange] = useEdgesState(initial.edges);

  return (
    <div className="space-y-4">
      <p className="text-base text-zinc-600">
        Import-style links between tracked files: Java/Kotlin, C#, Swift modules,
        JS/TS relative imports, Python packages, Go module paths, and Rust{" "}
        <code className="rounded bg-zinc-100 px-1 text-sm">crate::</code> /{" "}
        <code className="rounded bg-zinc-100 px-1 text-sm">mod</code>.{" "}
        {repoName ? `Latest run: ${repoName}.` : ""}{" "}
        <span className="text-zinc-500">
          Roots / leaves are heuristics (no entry-point detection yet).
        </span>
      </p>
      <div className="h-[min(70vh,720px)] min-h-[400px] w-full rounded-lg border border-zinc-200 bg-zinc-50/50">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          fitView
          minZoom={0.08}
          maxZoom={1.5}
          proOptions={{ hideAttribution: true }}
        >
          <Background />
          <Controls />
          <MiniMap
            nodeStrokeWidth={3}
            className="!bg-white"
            zoomable
            pannable
          />
        </ReactFlow>
      </div>
      <div className="grid gap-3 text-sm text-zinc-600 sm:grid-cols-2">
        <p>
          <span className="font-medium text-zinc-800">Roots (hint):</span>{" "}
          {graph.rootsHint.length} file(s) with no incoming edges in this
          graph.
        </p>
        <p>
          <span className="font-medium text-zinc-800">Leaves (hint):</span>{" "}
          {graph.leavesHint.length} file(s) with no outgoing edges — possible
          dead ends for pruning review.
        </p>
      </div>
    </div>
  );
}
