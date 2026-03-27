// ── Graph Panel (Right Sidebar) ──
//
// Compact graph view for the right panel slot.
//
// SolidJS reactivity:
//   - `getGraphStore()` is a signal accessor — reads are tracked
//   - Store properties accessed inside JSX / createMemo are granular
//   - No intermediate wrappers or manual subscriptions needed

import { createMemo } from "solid-js";

import { getActiveTab, openTab } from "~/stores/files";

import { type GraphNode } from "./graph_types";
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
  const currentFilePath = createMemo(() => getActiveTab()?.filePath ?? null);

  return (
    <div class="flex h-full min-h-0 flex-col overflow-hidden bg-bg-secondary/60">
      {/* ── Canvas ── */}
      <div class="flex min-h-0 flex-1">
        <GraphCanvas
          variant="compact"
          currentFilePath={currentFilePath()}
          onNodeClick={openGraphNode}
        />
      </div>
    </div>
  );
}
