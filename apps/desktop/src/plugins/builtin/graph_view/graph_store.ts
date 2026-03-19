// ── Graph Store ──
//
// Reactive store for the graph-view plugin.
//
// SolidJS design decisions:
//
//   1. The module-level singleton is a `createSignal<GraphStoreLike | null>`,
//      NOT a plain `let`. This ensures any component reading `getGraphStore()`
//      inside a tracking scope (createEffect, createMemo, JSX) will re-render
//      when the store is created or destroyed during plugin lifecycle.
//
//   2. Internal state uses `createStore<GraphState>` — property-level
//      granular tracking. Components should read `store.state.nodes` etc.
//      directly (never destructure) so SolidJS can track individual properties.
//
//   3. All mutations go through `setState()` which notifies only the
//      properties that actually changed.

import { createSignal } from "solid-js";
import { createStore, produce } from "solid-js/store";

import type { FileEntry } from "~/lib/vault_fs";

import type { GraphParser } from "./graph_parser";
import type { GraphLink, GraphNode, GraphState, GraphStoreLike } from "./graph_types";

// ── Config ────────────────────────────────────────────────────

interface GraphStoreConfig {
  readFile(path: string): Promise<string>;
  listFiles(): Promise<FileEntry[]>;
  parser: GraphParser;
  debounceMs?: number;
  concurrency?: number;
}

const DEFAULT_DEBOUNCE_MS = 300;
const DEFAULT_CONCURRENCY = 8;

// ── Reactive Singleton ────────────────────────────────────────
//
// `getGraphStore` is a SolidJS signal accessor. Reading it inside
// any tracking scope (createEffect, createMemo, JSX expression)
// subscribes the consumer to store lifecycle changes.
//
//   ✅  const store = getGraphStore();            — tracked
//   ✅  createEffect(() => { getGraphStore(); })  — re-runs on change
//   ❌  let store = someLetVariable;              — NOT tracked
//
// Previously this was a plain `let`, which meant components that
// rendered before plugin activation got `null` and never updated.

const [getGraphStore, setGraphStore] = createSignal<GraphStoreLike | null>(null);

// ── Pure Helpers (no SolidJS dependency) ──────────────────────

function flattenFileEntries(entries: FileEntry[]): FileEntry[] {
  const result: FileEntry[] = [];
  for (const entry of entries) {
    result.push(entry);
    if (entry.children?.length) {
      result.push(...flattenFileEntries(entry.children));
    }
  }
  return result;
}

function isMarkdownFile(entry: FileEntry): boolean {
  return !entry.is_directory && /\.(md|markdown)$/i.test(entry.name);
}

function stripExtension(value: string): string {
  return value.replace(/\.(md|markdown)$/i, "");
}

function fileNameFromPath(path: string): string {
  return path.split("/").at(-1) ?? path;
}

/**
 * Extract the folder portion of a vault-relative path.
 * Files at the vault root get `"Root"` so they form a single cluster.
 */
function folderFromPath(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx !== -1 ? path.slice(0, idx) : "Root";
}

function normalizeTarget(value: string): string {
  return stripExtension(value.trim().replace(/\\/g, "/")).toLowerCase();
}

// ── Path Index ────────────────────────────────────────────────

interface PathIndex {
  byBaseName: Map<string, string>;
  byPath: Map<string, string>;
}

function buildPathIndex(files: FileEntry[]): PathIndex {
  const byBaseName = new Map<string, string>();
  const byPath = new Map<string, string>();

  for (const file of files) {
    const normalizedPath = normalizeTarget(file.path);
    const baseName = normalizeTarget(fileNameFromPath(file.path));

    byPath.set(normalizedPath, file.path);
    if (!byBaseName.has(baseName)) {
      byBaseName.set(baseName, file.path);
    }
  }

  return { byBaseName, byPath };
}

/**
 * Resolve a wikilink target string to an actual file path.
 *
 * Strategy:
 *  1. Exact normalized-path match
 *  2. Basename-only match (case-insensitive)
 *  3. If target contains `/`, try matching the last segment
 */
function resolveLinkTarget(target: string, index: PathIndex): string | null {
  const normalized = normalizeTarget(target);
  if (!normalized) return null;

  const exactMatch = index.byPath.get(normalized);
  if (exactMatch) return exactMatch;

  const baseName = normalized.split("/").at(-1) ?? normalized;
  return index.byBaseName.get(baseName) ?? null;
}

// ── Wikilink Extraction ───────────────────────────────────────

interface MdastLike {
  type?: string;
  target?: string;
  children?: MdastLike[];
}

/**
 * Walk an mdast tree and collect all wikilink target strings.
 */
function extractWikilinkTargets(node: unknown): string[] {
  const targets: string[] = [];

  function walk(n: unknown): void {
    if (!n || typeof n !== "object") return;
    const candidate = n as MdastLike;

    if (candidate.type === "wikilink" && candidate.target) {
      targets.push(candidate.target);
    }

    if (Array.isArray(candidate.children)) {
      for (const child of candidate.children) {
        walk(child);
      }
    }
  }

  walk(node);
  return targets;
}

// ── Batched Concurrency ───────────────────────────────────────
//
// Limits the number of simultaneous file reads so we don't
// overwhelm the Tauri IPC channel on large vaults.

async function runBatched<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let index = 0;

  async function worker(): Promise<void> {
    while (index < items.length) {
      const current = index++;
      await fn(items[current]);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
}

// ── Store Factory ─────────────────────────────────────────────

function createGraphStore(config: GraphStoreConfig): GraphStoreLike {
  const debounceMs = config.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const concurrency = config.concurrency ?? DEFAULT_CONCURRENCY;

  const [state, setState] = createStore<GraphState>({
    nodes: [],
    links: [],
    adjacencyMap: {},
    clusters: [],
    isIndexing: false,
    lastIndexedAt: null,
    error: null,
  });

  let rebuildTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  // ── Build ─────────────────────────────────────────────────

  async function buildGraphData(): Promise<void> {
    if (disposed) return;
    if (state.isIndexing) return; // prevent concurrent builds

    setState("isIndexing", true);
    setState("error", null);

    try {
      const tree = await config.listFiles();
      const files = flattenFileEntries(tree).filter(isMarkdownFile);
      const pathIndex = buildPathIndex(files);

      // Per-file wikilink targets (raw, unresolved)
      const fileLinks = new Map<string, string[]>();
      let failureCount = 0;

      await runBatched(files, concurrency, async (file) => {
        try {
          const content = await config.readFile(file.path);
          const parsed = config.parser.parse(content);
          const targets = extractWikilinkTargets(parsed);
          fileLinks.set(file.path, targets);
        } catch (error) {
          failureCount += 1;
          fileLinks.set(file.path, []);
          // eslint-disable-next-line no-console
          console.warn(`[graph-view] Failed to index "${file.path}"`, error);
        }
      });

      // ── Build nodes, links, adjacency, clusters ──────────

      const nodeMap = new Map<string, GraphNode>();
      const links: GraphLink[] = [];
      const adjacency = new Map<string, Set<string>>();
      const clusterSet = new Set<string>();
      const seenLinks = new Set<string>();

      // First pass: create all nodes
      for (const file of files) {
        const folder = folderFromPath(file.path);
        clusterSet.add(folder);

        nodeMap.set(file.path, {
          id: file.path,
          name: stripExtension(fileNameFromPath(file.path)),
          filePath: file.path,
          folder,
          clusterIndex: 0, // assigned below
          linkCount: 0,
          isOrphan: true,
        });
      }

      // Assign cluster indices (sorted for stable color mapping)
      const clusters = [...clusterSet].sort();
      const clusterIndexMap = new Map<string, number>();
      clusters.forEach((c: string, i: number) => clusterIndexMap.set(c, i));

      for (const node of nodeMap.values()) {
        node.clusterIndex = clusterIndexMap.get(node.folder) ?? 0;
      }

      // Second pass: resolve wikilinks → edges + adjacency
      for (const file of files) {
        const targets = fileLinks.get(file.path) ?? [];
        if (!adjacency.has(file.path)) adjacency.set(file.path, new Set());

        for (const rawTarget of targets) {
          const resolved = resolveLinkTarget(rawTarget, pathIndex);
          if (!resolved || resolved === file.path) continue; // skip self-links & unresolved

          const linkKey = `${file.path}\0${resolved}`;
          if (seenLinks.has(linkKey)) continue;
          seenLinks.add(linkKey);

          links.push({ source: file.path, target: resolved });

          adjacency.get(file.path)?.add(resolved);
          if (!adjacency.has(resolved)) adjacency.set(resolved, new Set<string>());
          adjacency.get(resolved)?.add(file.path);
        }
      }

      // Compute link counts from adjacency
      for (const [fp, neighbours] of adjacency) {
        const node = nodeMap.get(fp);
        if (node) {
          node.linkCount = neighbours.size;
          node.isOrphan = neighbours.size === 0;
        }
      }

      // Serialise adjacency for the SolidJS store (Set → string[])
      const adjacencyRecord: Record<string, string[]> = {};
      for (const [fp, neighbours] of adjacency) {
        adjacencyRecord[fp] = [...neighbours];
      }

      // Sort for deterministic rendering (spread creates new array, sort is safe)
      const nodes = [...nodeMap.values()].sort((a, b) => a.name.localeCompare(b.name));

      const sortedLinks = [...links].sort((a, b) => {
        const srcCmp = a.source.localeCompare(b.source);
        return srcCmp !== 0 ? srcCmp : a.target.localeCompare(b.target);
      });

      // ── Commit to SolidJS store (single batch) ───────────
      //
      // Using `produce` so SolidJS diffs at the property level.
      // Consumers tracking only `state.isIndexing` won't re-run
      // from a `nodes` change, etc.

      setState(
        produce((s) => {
          s.nodes = nodes;
          s.links = sortedLinks;
          s.adjacencyMap = adjacencyRecord;
          s.clusters = clusters;
          s.isIndexing = false;
          s.lastIndexedAt = Date.now();
          s.error = failureCount > 0 ? `Failed to index ${failureCount} file(s).` : null;
        }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setState(
        produce((s) => {
          s.isIndexing = false;
          s.error = message;
        }),
      );
    }
  }

  // ── Debounced Rebuild ─────────────────────────────────────

  function scheduleRebuild(): void {
    if (disposed) return;
    if (rebuildTimer) clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(() => {
      rebuildTimer = null;
      void buildGraphData();
    }, debounceMs);
  }

  // ── Clear ─────────────────────────────────────────────────

  function clear(): void {
    if (rebuildTimer) {
      clearTimeout(rebuildTimer);
      rebuildTimer = null;
    }
    setState({
      nodes: [],
      links: [],
      adjacencyMap: {},
      clusters: [],
      isIndexing: false,
      lastIndexedAt: null,
      error: null,
    });
  }

  // ── Dispose ───────────────────────────────────────────────

  function dispose(): void {
    disposed = true;
    if (rebuildTimer) {
      clearTimeout(rebuildTimer);
      rebuildTimer = null;
    }
  }

  return { state, buildGraphData, scheduleRebuild, clear, dispose };
}

// ── Query Helpers ─────────────────────────────────────────────
//
// These read from `store.state` which is a SolidJS store proxy.
// When called inside a tracking scope, the consumer subscribes
// to changes in the specific properties accessed.

function getOutgoingLinks(store: GraphStoreLike, filePath: string): string[] {
  return store.state.links.filter((l) => l.source === filePath).map((l) => l.target);
}

function getBacklinks(store: GraphStoreLike, filePath: string): string[] {
  return store.state.links.filter((l) => l.target === filePath).map((l) => l.source);
}

function getConnectedNodes(store: GraphStoreLike, filePath: string): string[] {
  return store.state.adjacencyMap[filePath] ?? [];
}

// ── Exports ───────────────────────────────────────────────────

export {
  createGraphStore,
  getBacklinks,
  getConnectedNodes,
  getGraphStore,
  getOutgoingLinks,
  setGraphStore,
};
