import { Show, type JSX } from "solid-js";

import Switch from "~/components/ui/switch";

import { indexerConfig, updateIndexerConfig } from "./settings";
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

  async function handleConfigToggle(
    key: "incrementalUpdates" | "reindexOnVaultOpen",
    value: boolean,
  ): Promise<void> {
    const service = getSearchService();
    if (!service) return;
    await updateIndexerConfig(service, key, value);
    await refreshIndexerStatus(service);
  }

  return (
    <div class="overflow-hidden rounded-xs border border-border bg-bg-primary">
      <div class="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h3 class="text-[0.8125rem] font-medium text-text-primary">Indexer</h3>
          <p class="mt-0.5 text-[0.75rem] text-text-muted">
            Manage search, wikilink graph indexing, and refresh policy.
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
            <StatRow
              label="Documents"
              value={`${indexerStatus.indexedDocs} / ${indexerStatus.totalDocs}`}
            />
            <StatRow label="Resolved links" value={String(indexerStatus.resolvedLinks)} />
            <StatRow label="Unresolved links" value={String(indexerStatus.unresolvedLinks)} />
            <StatRow label="Ambiguous links" value={String(indexerStatus.ambiguousLinks)} />
            <StatRow label="Last indexed" value={formatTimestamp(indexerStatus.lastIndexedAt)} />
          </div>

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

        <Show when={indexerStatus.error}>
          {(error) => (
            <div class="rounded-xs border border-error-border bg-error-bg px-3 py-2 text-[0.75rem] text-error">
              {error()}
            </div>
          )}
        </Show>

        <div class="rounded-xs border border-border bg-bg-secondary/40 p-3">
          <div class="flex items-center justify-between gap-2">
            <div>
              <div class="text-[0.6875rem] tracking-[0.12em] text-text-muted uppercase">
                Wikilink Indexing
              </div>
              <p class="mt-1 text-[0.75rem] text-text-muted">
                Resolution policy is fixed to{" "}
                <span class="font-medium text-text-primary">closest-folder</span>.
              </p>
            </div>
          </div>

          <div class="mt-4 space-y-3">
            <SettingRow
              title="Incremental updates"
              description="Apply file changes as targeted link/index updates instead of full rebuilds."
              control={
                <Switch
                  checked={indexerConfig.incrementalUpdates}
                  onChange={(checked) => void handleConfigToggle("incrementalUpdates", checked)}
                />
              }
            />
            <SettingRow
              title="Reindex on vault open"
              description="Run a cold-start rebuild when a vault opens."
              control={
                <Switch
                  checked={indexerConfig.reindexOnVaultOpen}
                  onChange={(checked) => void handleConfigToggle("reindexOnVaultOpen", checked)}
                />
              }
            />
          </div>
        </div>

        <div class="flex items-center justify-between gap-2">
          <p class="text-[0.6875rem] text-text-muted">
            Rebuild clears and re-indexes search chunks plus wikilink graph data.
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

function StatRow(props: { label: string; value: string }): JSX.Element {
  return (
    <div class="flex items-center justify-between text-text-secondary">
      <span>{props.label}</span>
      <span class="font-medium text-text-primary">{props.value}</span>
    </div>
  );
}

function SettingRow(props: {
  title: string;
  description: string;
  control: JSX.Element;
}): JSX.Element {
  return (
    <div class="flex items-start justify-between gap-4 rounded-xs border border-border/60 bg-bg-primary/60 px-3 py-2">
      <div>
        <div class="text-[0.75rem] font-medium text-text-primary">{props.title}</div>
        <p class="mt-0.5 text-[0.6875rem] text-text-muted">{props.description}</p>
      </div>
      <div class="shrink-0">{props.control}</div>
    </div>
  );
}

export { IndexerSettings };
