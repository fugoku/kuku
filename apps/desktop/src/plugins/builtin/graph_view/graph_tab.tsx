// ── Graph Tab ──
//
// Full-width graph view rendered in the center tab area.
//
// SolidJS reactivity:
//   - `getGraphStore()` is a signal read — component re-renders when
//     the store is created/destroyed during plugin lifecycle
//   - Store properties (nodes, links, clusters, …) accessed lazily
//     inside JSX expressions for fine-grained tracking
//   - GraphCanvas handle stored in a signal for zoom control access

import { createMemo, createSignal, Show } from "solid-js";

import { getActiveTab, openTab } from "~/stores/files";

import GraphCanvas from "./graph_canvas";
import { getGraphStore } from "./graph_store";
import {
  clusterColor,
  getGraphSummary,
  type GraphCanvasHandle,
  type GraphNode,
} from "./graph_types";

// ── Helpers ──────────────────────────────────────────────────

function fileNameFromPath(path: string): string {
  return path.split("/").at(-1) ?? path;
}

function openGraphNode(node: GraphNode): void {
  openTab(fileNameFromPath(node.filePath), node.filePath, "editor");
}

// ── Component ────────────────────────────────────────────────

export default function GraphTab() {
  // Handle is stored for future toolbar integration (e.g. external zoom buttons).
  // Currently only `setHandle` is used as the onHandle callback.
  const [, setHandle] = createSignal<GraphCanvasHandle | null>(null);

  // ── Reactive derivations ────────────────────────────────
  //
  // `getGraphStore()` reads the module-level signal — tracked.
  // `summary()` reads store.state.nodes/links/clusters inside
  // `getGraphSummary`, so it re-computes only when those change.

  const store = () => getGraphStore();
  const summary = createMemo(() => getGraphSummary(store()?.state ?? null));

  // Track the currently active file for "locate current" feature
  const currentFilePath = createMemo(() => {
    const tab = getActiveTab();
    if (tab?.type === "editor" && tab.filePath) {
      return tab.filePath;
    }
    return null;
  });

  const lastIndexedLabel = createMemo(() => {
    const ts = store()?.state.lastIndexedAt;
    if (!ts) return null;
    return new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(ts));
  });

  return (
    <div class="flex h-full min-h-0 flex-col overflow-hidden bg-bg-primary">
      {/* ── Header ── */}
      <div class="flex items-center justify-between border-b border-border/70 bg-bg-secondary/60 px-4 py-3">
        <div class="space-y-0.5">
          <p class="text-sm font-medium text-text-primary">Graph</p>
          <p class="text-xs text-text-muted">Visualize wikilink connections across the vault.</p>
        </div>

        <div class="flex items-center gap-3 text-[0.6875rem] text-text-muted">
          <span>{summary().nodeCount} nodes</span>
          <span>·</span>
          <span>{summary().linkCount} links</span>
          <span>·</span>
          <span>{summary().clusterCount} clusters</span>

          <Show when={summary().orphanCount > 0}>
            <span>·</span>
            <span class="text-text-muted/70">
              {summary().orphanCount} orphan{summary().orphanCount > 1 ? "s" : ""}
            </span>
          </Show>

          <Show when={lastIndexedLabel()}>
            <span>·</span>
            <span>updated {lastIndexedLabel()}</span>
          </Show>
        </div>
      </div>

      {/* ── Canvas ── */}
      <div class="flex min-h-0 flex-1">
        <GraphCanvas
          variant="full"
          currentFilePath={currentFilePath()}
          onNodeClick={openGraphNode}
          onHandle={setHandle}
        />
      </div>

      {/* ── Legend (clusters) ── */}
      <Show when={summary().clusterCount > 0}>
        <div class="flex items-center gap-3 border-t border-border/70 bg-bg-secondary/40 px-4 py-2">
          {(store()?.state.clusters ?? []).slice(0, 5).map((cluster, i) => (
            <div class="flex items-center gap-1.5 text-[0.6875rem] text-text-muted">
              <span
                class="inline-block size-2 rounded-full"
                style={{ background: clusterColor(i) }}
              />
              <span>{cluster.split("/").pop() ?? cluster}</span>
            </div>
          ))}
          <Show when={(store()?.state.clusters.length ?? 0) > 5}>
            <span class="text-[0.6875rem] text-text-muted">
              +{(store()?.state.clusters.length ?? 0) - 5} more
            </span>
          </Show>
        </div>
      </Show>
    </div>
  );
}
