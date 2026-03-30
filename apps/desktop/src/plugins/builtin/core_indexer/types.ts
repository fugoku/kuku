export interface IndexerStatus {
  state: "idle" | "indexing" | "error";
  totalDocs: number;
  indexedDocs: number;
  lastIndexedAt: number | null;
  resolvedLinks: number;
  unresolvedLinks: number;
  ambiguousLinks: number;
  error: string | null;
}

export interface SimpleSearchHit {
  docId: string;
  title: string | null;
  sectionPath: string[];
  sectionOrdinal: number;
  snippet: string;
  kind: string;
  score: number;
}

export interface SimpleSearchResult {
  query: string;
  total: number;
  items: SimpleSearchHit[];
}

export interface AdvancedQueryRequest {
  query: string;
  caseSensitive: boolean;
  maxResults?: number;
}

export interface IndexerConfig {
  incrementalUpdates: boolean;
  reindexOnVaultOpen: boolean;
  resolutionPolicy: "closest-folder";
}

export interface GraphNodeSnapshot {
  id: string;
  name: string;
  filePath: string;
  folder: string;
  clusterIndex: number;
  linkCount: number;
  isOrphan: boolean;
}

export interface GraphLinkSnapshot {
  source: string;
  target: string;
}

export interface GraphSnapshot {
  nodes: GraphNodeSnapshot[];
  links: GraphLinkSnapshot[];
  adjacencyMap: Record<string, string[]>;
  unresolvedCount: number;
  ambiguousCount: number;
}

export interface ResolveWikilinkResult {
  resolvedPath: string | null;
  resolutionKind: "exact" | "basename" | "ambiguous" | "unresolved";
}
