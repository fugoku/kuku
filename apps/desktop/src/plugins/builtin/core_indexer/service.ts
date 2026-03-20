import { invoke } from "@tauri-apps/api/core";

import type { AdvancedQueryRequest, IndexerStatus, SimpleSearchResult } from "./types";

interface SearchService {
  querySimple(query: string, options?: { maxResults?: number }): Promise<SimpleSearchResult>;
  queryAdvanced(request: AdvancedQueryRequest): Promise<SimpleSearchResult>;
  getStatus(): Promise<IndexerStatus>;
  requestRebuild(): Promise<void>;
}

function createSearchService(): SearchService {
  return {
    async querySimple(query, options) {
      return invoke<SimpleSearchResult>("search_query_simple", {
        query,
        maxResults: options?.maxResults ?? 20,
      });
    },
    async queryAdvanced(request) {
      return invoke<SimpleSearchResult>("search_query_advanced", {
        request: {
          query: request.query,
          caseSensitive: request.caseSensitive,
          maxResults: request.maxResults ?? 20,
        },
      });
    },
    async getStatus() {
      return invoke<IndexerStatus>("search_get_status");
    },
    async requestRebuild() {
      await invoke<void>("search_request_rebuild");
    },
  };
}

export { createSearchService };
export type { SearchService };
