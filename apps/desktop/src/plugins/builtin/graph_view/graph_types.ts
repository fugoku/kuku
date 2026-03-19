// ── Graph View Type Definitions ──
//
// Shared types for the graph-view plugin.
// All reactive state shapes, force-graph bridge types, and pure helper functions.

// ── Domain Types ──────────────────────────────────────────────

export interface GraphNode {
  id: string;
  name: string;
  filePath: string;
  folder: string;
  clusterIndex: number;
  linkCount: number;
  isOrphan: boolean;
}

export interface GraphLink {
  source: string;
  target: string;
}

// ── Reactive State (SolidJS store shape) ──────────────────────

export interface GraphState {
  nodes: GraphNode[];
  links: GraphLink[];
  adjacencyMap: Record<string, string[]>;
  clusters: string[];
  isIndexing: boolean;
  lastIndexedAt: number | null;
  error: string | null;
}

// ── Store Interface ───────────────────────────────────────────

/**
 * Public API surface of the graph store.
 *
 * `state` is a SolidJS store proxy — property reads inside
 * `createEffect` / `createMemo` / JSX are automatically tracked.
 * Always access properties lazily (e.g. `store.state.nodes`),
 * never destructure at the top level.
 */
export interface GraphStoreLike {
  readonly state: GraphState;
  buildGraphData(): Promise<void>;
  scheduleRebuild(): void;
  clear(): void;
  dispose(): void;
}

// ── Force-Graph Bridge Types ──────────────────────────────────
//
// `force-graph` mutates node/link objects in place with position
// and velocity fields. We deep-copy domain data into these shapes
// before handing them to the simulation, so the SolidJS store
// is never mutated by the physics engine.

export interface FGNode extends GraphNode {
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  /** Pinned position (set after drag-to-pin). */
  fx?: number | undefined;
  fy?: number | undefined;
  /** Transient: drag start position for click-vs-drag detection. */
  __dragStartX?: number;
  __dragStartY?: number;
}

export interface FGLink {
  source: string | FGNode;
  target: string | FGNode;
}

// ── View Props ────────────────────────────────────────────────

export type GraphVariant = "full" | "compact";

export interface GraphCanvasHandle {
  zoomIn(): void;
  zoomOut(): void;
  fitView(): void;
  resetView(): void;
  locateNode(filePath: string): void;
}

// ── Pure Helpers (no SolidJS dependency) ──────────────────────

export interface GraphSummary {
  nodeCount: number;
  linkCount: number;
  orphanCount: number;
  clusterCount: number;
}

export function getGraphSummary(state: GraphState | null | undefined): GraphSummary {
  if (!state) {
    return { nodeCount: 0, linkCount: 0, orphanCount: 0, clusterCount: 0 };
  }
  return {
    nodeCount: state.nodes.length,
    linkCount: state.links.length,
    orphanCount: state.nodes.filter((n) => n.isOrphan).length,
    clusterCount: state.clusters.length,
  };
}

export function hasGraphData(state: GraphState | null | undefined): boolean {
  return (state?.nodes.length ?? 0) > 0;
}

// ── Cluster Palette ───────────────────────────────────────────

export const CLUSTER_COLORS = [
  "#3b82f6", // Blue
  "#10b981", // Emerald
  "#f59e0b", // Amber
  "#8b5cf6", // Violet
  "#ec4899", // Pink
  "#06b6d4", // Cyan
  "#f97316", // Orange
  "#84cc16", // Lime
  "#6366f1", // Indigo
  "#14b8a6", // Teal
  "#e11d48", // Rose
  "#a855f7", // Purple
] as const;

export const CLUSTER_BG_COLORS = [
  "rgba(59, 130, 246, 0.12)",
  "rgba(16, 185, 129, 0.12)",
  "rgba(245, 158, 11, 0.12)",
  "rgba(139, 92, 246, 0.12)",
  "rgba(236, 72, 153, 0.12)",
  "rgba(6, 182, 212, 0.12)",
  "rgba(249, 115, 22, 0.12)",
  "rgba(132, 204, 22, 0.12)",
  "rgba(99, 102, 241, 0.12)",
  "rgba(20, 184, 166, 0.12)",
  "rgba(225, 29, 72, 0.12)",
  "rgba(168, 85, 247, 0.12)",
] as const;

export function clusterColor(index: number): string {
  return CLUSTER_COLORS[index % CLUSTER_COLORS.length];
}

export function clusterBgColor(index: number): string {
  return CLUSTER_BG_COLORS[index % CLUSTER_BG_COLORS.length];
}
