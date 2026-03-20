export interface IndexerStatus {
  state: "idle" | "indexing" | "error";
  totalDocs: number;
  indexedDocs: number;
  lastIndexedAt: number | null;
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
