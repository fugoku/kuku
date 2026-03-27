import { Show, type JSX } from "solid-js";

import { indexerStatus, refreshIndexerStatus } from "../core_indexer/status_store";
import { getSearchService } from "../search/runtime";

function formatTimestamp(ts: number | null): string {
  if (!ts) return "Never";
  const date = new Date(ts);
  return date.toLocaleString();
}

function statusLabel(state: string): string {
  if (state === "indexing") return "Indexing…";
  if (state === "error") return "Error";
  return "Ready";
}

function IndexerSettings(): JSX.Element {
  const isIndexing = () => indexerStatus.state === "indexing";

  async function handleRebuild(): Promise<void> {
    const service = getSearchService();
    if (!service) return;
    await service.requestRebuild();
    await refreshIndexerStatus(service);
  }

  async function handleRefreshStatus(): Promise<void> {
    const service = getSearchService();
    if (!service) return;
    await refreshIndexerStatus(service);
  }

  return (
    <div class="overflow-hidden rounded-md border border-border bg-bg-primary">
      {/* Header */}
      <div class="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h3 class="text-[0.8125rem] font-medium text-text-primary">Indexer</h3>
          <p class="mt-0.5 text-[0.75rem] text-text-muted">
            Manage search index and vault indexing.
          </p>
        </div>
        <button
          type="button"
          class="rounded-xs border border-border bg-bg-secondary px-2.5 py-1 text-[0.6875rem] text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
          onClick={() => void handleRefreshStatus()}
        >
          Refresh
        </button>
      </div>

      <div class="space-y-3 p-4">
        {/* Status */}
        <div class="rounded-xs border border-border bg-bg-secondary/70 p-3">
          <div class="flex items-center justify-between gap-2">
            <span class="text-[0.6875rem] tracking-[0.12em] text-text-muted uppercase">
              Index Status
            </span>
            <span
              class="rounded-xs border px-2 py-0.5 text-[0.6875rem]"
              classList={{
                "border-success-border bg-success-bg text-success": indexerStatus.state === "idle",
                "border-info-border bg-info-bg text-info": isIndexing(),
                "border-error-border bg-error-bg text-error": indexerStatus.state === "error",
              }}
            >
              {statusLabel(indexerStatus.state)}
            </span>
          </div>

          <div class="mt-3 space-y-1.5 text-[0.75rem]">
            <div class="flex items-center justify-between text-text-secondary">
              <span>Documents</span>
              <span class="font-medium text-text-primary">
                {indexerStatus.indexedDocs} / {indexerStatus.totalDocs}
              </span>
            </div>
            <div class="flex items-center justify-between text-text-secondary">
              <span>Last indexed</span>
              <span class="text-text-primary">{formatTimestamp(indexerStatus.lastIndexedAt)}</span>
            </div>
          </div>

          {/* Progress bar (visible during indexing) */}
          <Show when={isIndexing() && indexerStatus.totalDocs > 0}>
            <div class="mt-3 h-1 overflow-hidden rounded-xs bg-bg-tertiary">
              <div
                class="h-full rounded-xs bg-info transition-all duration-300"
                style={{
                  width: `${Math.round((indexerStatus.indexedDocs / indexerStatus.totalDocs) * 100)}%`,
                }}
              />
            </div>
          </Show>
        </div>

        {/* Error */}
        <Show when={indexerStatus.error}>
          {(error) => (
            <div class="rounded-xs border border-error-border bg-error-bg px-3 py-2 text-[0.75rem] text-error">
              {error()}
            </div>
          )}
        </Show>

        {/* Actions */}
        <div class="flex items-center justify-between gap-2">
          <p class="text-[0.6875rem] text-text-muted">
            Rebuild clears and re-indexes all vault files.
          </p>
          <button
            type="button"
            disabled={isIndexing()}
            class="shrink-0 rounded-xs border border-warning-border bg-warning-bg px-3 py-1.5 text-[0.6875rem] text-warning transition-colors hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => void handleRebuild()}
          >
            {isIndexing() ? "Indexing…" : "Rebuild Index"}
          </button>
        </div>
      </div>
    </div>
  );
}

export { IndexerSettings };
