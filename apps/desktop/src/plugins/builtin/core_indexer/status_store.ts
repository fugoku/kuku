import { createStore } from "solid-js/store";

import type { Disposer } from "~/plugins/types";

import type { SearchService } from "./service";
import type { IndexerStatus } from "./types";

const DEFAULT_STATUS: IndexerStatus = {
  state: "idle",
  totalDocs: 0,
  indexedDocs: 0,
  lastIndexedAt: null,
  error: null,
};

const [indexerStatus, setIndexerStatus] = createStore<IndexerStatus>({ ...DEFAULT_STATUS });

function applyIndexerStatus(status: IndexerStatus): void {
  setIndexerStatus({
    state: status.state,
    totalDocs: status.totalDocs,
    indexedDocs: status.indexedDocs,
    lastIndexedAt: status.lastIndexedAt,
    error: status.error,
  });
}

function resetIndexerStatus(): void {
  applyIndexerStatus({ ...DEFAULT_STATUS });
}

async function refreshIndexerStatus(service: SearchService): Promise<void> {
  try {
    applyIndexerStatus(await service.getStatus());
  } catch {
    // Silent degraded state for v1.
  }
}

function startStatusPolling(service: SearchService): Disposer {
  void refreshIndexerStatus(service);
  const timer = setInterval(() => {
    void refreshIndexerStatus(service);
  }, 5000);

  return () => clearInterval(timer);
}

export {
  applyIndexerStatus,
  indexerStatus,
  refreshIndexerStatus,
  resetIndexerStatus,
  startStatusPolling,
};
