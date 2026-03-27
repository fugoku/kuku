// ── Graph Panel (Right Sidebar) ──
//
// Compact graph view for the right panel slot.
//
// SolidJS reactivity:
//   - `getGraphStore()` is a signal accessor — reads are tracked
//   - Store properties accessed inside JSX / createMemo are granular
//   - No intermediate wrappers or manual subscriptions needed

import { createMemo, Show } from "solid-js";

import { getActiveTab, openTab } from "~/stores/files";

import { getGraphStore } from "./graph_store";
import { getGraphSummary, type GraphNode } from "./graph_types";
import GraphCanvas from "./graph_canvas";

// ── Helpers ───────────────────────────────────────────────────

function fileNameFromPath(path: string): string {
  return path.split("/").at(-1) ?? path;
}

function openGraphNode(node: GraphNode): void {
  openTab(fileNameFromPath(node.filePath), node.filePath, "editor");
}

// ── Component ─────────────────────────────────────────────────

export default function GraphPanel() {
  // Derived state — reads signal inside tracking scope
  const store = createMemo(() => getGraphStore());
  const summary = createMemo(() => getGraphSummary(store()?.state ?? null));
  const currentFilePath = createMemo(() => getActiveTab()?.filePath ?? null);

  return (
    <div class="flex h-full min-h-0 flex-col overflow-hidden bg-bg-secondary">
      {/* ── Header ── */}
      <div class="border-b border-border/70 px-3 py-2">
        <div class="flex items-center justify-between">
          <div class="space-y-0.5">
            <p class="text-[0.8125rem] font-medium text-text-primary">Graph</p>
            <p class="text-[0.6875rem] text-text-muted">Note network</p>
          </div>
          <div class="flex items-center gap-2 text-[0.6875rem] text-text-muted">
            <span>{summary().nodeCount}</span>
            <span class="text-border">/</span>
            <span>{summary().linkCount}</span>
          </div>
        </div>

        <Show when={store()?.state.error}>
          <p class="mt-2 text-[0.6875rem] text-text-muted">{store()?.state.error}</p>
        </Show>
      </div>

      {/* ── Canvas ── */}
      <div class="flex min-h-0 flex-1 p-2">
        <GraphCanvas
          variant="compact"
          currentFilePath={currentFilePath()}
          onNodeClick={openGraphNode}
        />
      </div>
    </div>
  );
}
