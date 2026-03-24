import { Show } from "solid-js";

import { indexerStatus } from "../core_indexer/status_store";
import { openSearchHit } from "./navigation";
import { SearchResultsList } from "./search_results";
import { createSearchTabController } from "./search_tab_state";

const INPUT =
  "w-full rounded-md border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary outline-none transition-colors focus:border-accent";
const SEGMENT = "rounded-md px-3 py-1.5 text-xs transition-colors";

export default function SearchTab() {
  const controller = createSearchTabController();
  const searchResults = () => controller.results();
  const items = () => searchResults()?.items ?? [];

  return (
    <div class="flex h-full min-h-0 flex-col bg-bg-primary">
      <div class="border-b border-border px-4 py-3">
        <div class="flex items-center justify-between gap-3">
          <div class="inline-flex rounded-lg border border-border bg-bg-secondary p-1">
            <button
              type="button"
              class={SEGMENT}
              classList={{
                "bg-bg-tertiary text-text-primary": controller.mode() === "simple",
                "text-text-muted": controller.mode() !== "simple",
              }}
              onClick={() => controller.setMode("simple")}
            >
              Simple
            </button>
            <button
              type="button"
              class={SEGMENT}
              classList={{
                "bg-bg-tertiary text-text-primary": controller.mode() === "regex",
                "text-text-muted": controller.mode() !== "regex",
              }}
              onClick={() => controller.setMode("regex")}
            >
              Regex
            </button>
          </div>
          <button
            type="button"
            class="cursor-pointer rounded-md border border-border bg-bg-secondary px-3 py-2 text-xs text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
            onClick={() => void controller.requestRebuild()}
          >
            Rebuild
          </button>
        </div>

        <div class="mt-3 flex items-center gap-3">
          <input
            type="search"
            placeholder={controller.mode() === "regex" ? "Search with regex" : "Search your vault"}
            class={INPUT}
            value={controller.query()}
            onInput={(event) => controller.scheduleSearch(event.currentTarget.value)}
          />
        </div>
        <Show when={controller.mode() === "regex"}>
          <label class="mt-3 flex items-center gap-2 text-xs text-text-secondary">
            <input
              type="checkbox"
              checked={controller.caseSensitive()}
              onChange={(event) => controller.setCaseSensitive(event.currentTarget.checked)}
            />
            <span>Case sensitive</span>
          </label>
        </Show>

        <div class="mt-2 flex items-center justify-between text-xs text-text-muted">
          <span>
            Status: {indexerStatus.state} ({indexerStatus.indexedDocs}/{indexerStatus.totalDocs})
          </span>
          <Show when={controller.results()}>
            {(results) => <span>{results().total} result(s)</span>}
          </Show>
        </div>
        <Show when={indexerStatus.error}>
          {(error) => <p class="mt-1 text-xs text-red-400">{error()}</p>}
        </Show>
      </div>

      <div class="min-h-0 flex-1 overflow-auto px-4 py-3">
        <Show when={controller.isLoading()}>
          <p class="text-sm text-text-muted">Searching…</p>
        </Show>
        <Show when={!controller.isLoading() && controller.error()}>
          {(error) => <p class="text-sm text-red-400">{error()}</p>}
        </Show>
        <Show when={!controller.isLoading() && !controller.error() && !searchResults()}>
          <p class="text-sm text-text-muted">Type to search indexed markdown content.</p>
        </Show>
        <Show when={!controller.isLoading() && searchResults() && items().length === 0}>
          <p class="text-sm text-text-muted">No matches found.</p>
        </Show>
        <Show when={items().length > 0}>
          <SearchResultsList hits={items()} onSelect={openSearchHit} />
        </Show>
      </div>
    </div>
  );
}
